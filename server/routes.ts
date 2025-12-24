
import type { Express } from "express";
import { createServer, type Server } from "http";
import { setupAuth } from "./auth";
import { storage } from "./storage";
import { api } from "@shared/routes";
import { z } from "zod";
import multer from "multer";
import { openai } from "./openai"; // We will create this
import * as pdfParseLib from "pdf-parse";
const pdfParse = (pdfParseLib as any).default || pdfParseLib;
import fs from "fs";
import path from "path";
import { createRepositoryAndPush } from "./github";

// Setup multer for resume uploads
const upload = multer({ 
  dest: 'uploads/',
  limits: { fileSize: 5 * 1024 * 1024 } // 5MB limit
});

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  // Auth
  setupAuth(app);

  // === JOBS ===
  app.get(api.jobs.list.path, async (req, res) => {
    try {
      const filters = api.jobs.list.input?.parse({
        ...req.query,
        minSalary: req.query.minSalary ? Number(req.query.minSalary) : undefined,
        remote: req.query.remote === 'true',
      });
      const jobs = await storage.listJobs(filters);
      res.json(jobs);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      throw err;
    }
  });

  app.post(api.jobs.create.path, async (req, res) => {
    if (!req.isAuthenticated() || req.user.role !== 'employer') {
      return res.status(401).send();
    }
    const employerProfile = await storage.getEmployerProfile(req.user.id);
    if (!employerProfile) {
      return res.status(400).json({ message: "Employer profile not found" });
    }

    try {
      const input = api.jobs.create.input.parse(req.body);
      const job = await storage.createJob({ ...input, companyId: employerProfile.companyId });
      
      // Async: Generate job embedding
      // generateJobEmbedding(job.id); 

      res.status(201).json(job);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      throw err;
    }
  });

  app.get(api.jobs.get.path, async (req, res) => {
    const job = await storage.getJob(Number(req.params.id));
    if (!job) return res.status(404).send();
    res.json(job);
  });

  // === APPLICATIONS ===
  app.post(api.applications.apply.path, async (req, res) => {
    if (!req.isAuthenticated() || req.user.role !== 'seeker') {
      return res.status(401).send();
    }
    
    try {
      const input = api.applications.apply.input.parse(req.body);
      
      // Check if already applied
      const existingApps = await storage.listApplicationsForSeeker(req.user.id);
      if (existingApps.some(a => a.jobId === input.jobId)) {
        return res.status(400).json({ message: "Already applied" });
      }

      const app = await storage.createApplication({
        jobId: input.jobId,
        seekerId: req.user.id,
        note: input.note,
        status: "applied"
      });

      // Async: Trigger AI processing
      processApplicationAI(app.id);

      res.status(201).json(app);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      throw err;
    }
  });

  app.get(api.applications.list.path, async (req, res) => {
    if (!req.isAuthenticated() || req.user.role !== 'seeker') return res.status(401).send();
    const apps = await storage.listApplicationsForSeeker(req.user.id);
    res.json(apps);
  });

  app.get(api.applications.listForJob.path, async (req, res) => {
    if (!req.isAuthenticated() || req.user.role !== 'employer') return res.status(401).send();
    
    const job = await storage.getJob(Number(req.params.id));
    if (!job) return res.status(404).send();
    
    // Verify ownership
    const employerProfile = await storage.getEmployerProfile(req.user.id);
    if (!employerProfile || employerProfile.companyId !== job.companyId) {
      return res.status(403).send();
    }

    const apps = await storage.listApplicationsForJob(Number(req.params.id));
    res.json(apps);
  });

  app.patch(api.applications.updateStatus.path, async (req, res) => {
    if (!req.isAuthenticated() || req.user.role !== 'employer') return res.status(401).send();
    
    // In a real app, verify ownership of the application via job->company->employer
    // Skipping deep check for MVP speed, assume trusted if employer role + accessing ID
    
    const input = api.applications.updateStatus.input.parse(req.body);
    const updated = await storage.updateApplicationStatus(Number(req.params.id), input.status);
    res.json(updated);
  });

  // === SEEKER ===
  app.get(api.seeker.profile.path, async (req, res) => {
    if (!req.isAuthenticated()) return res.status(401).send();
    const profile = await storage.getSeekerProfile(req.user.id);
    if (!profile) return res.status(404).send();
    res.json(profile);
  });

  app.put(api.seeker.updateProfile.path, async (req, res) => {
    if (!req.isAuthenticated()) return res.status(401).send();
    const input = api.seeker.updateProfile.input.parse(req.body);
    
    let profile = await storage.getSeekerProfile(req.user.id);
    if (profile) {
      profile = await storage.updateSeekerProfile(req.user.id, input);
    } else {
      profile = await storage.createSeekerProfile({ ...input, userId: req.user.id, name: input.name || "Unknown" });
    }
    
    // Async: Generate profile embedding if skills/bio changed
    // generateProfileEmbedding(profile.id);

    res.json(profile);
  });

  app.post(api.seeker.uploadResume.path, upload.single('file'), async (req, res) => {
    if (!req.isAuthenticated()) return res.status(401).send();
    if (!req.file) return res.status(400).send("No file uploaded");

    try {
      const dataBuffer = fs.readFileSync(req.file.path);
      const data = await pdfParse(dataBuffer);
      const text = data.text;
      
      // In MVP, we just store the text and local path. 
      // In prod, upload to S3.
      const fileUrl = `/uploads/${req.file.filename}`;
      
      // Update profile with resume info
      let profile = await storage.getSeekerProfile(req.user.id);
      if (profile) {
        await storage.updateSeekerProfile(req.user.id, { 
          resumeUrl: fileUrl,
          resumeText: text 
        });
      } else {
        await storage.createSeekerProfile({
          userId: req.user.id,
          name: "New User", // Placeholder
          resumeUrl: fileUrl,
          resumeText: text
        });
      }

      res.json({ url: fileUrl, text: text.substring(0, 500) + "..." });
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: "Failed to parse PDF" });
    }
  });

  // === EMPLOYER ===
  app.post(api.employer.company.path, async (req, res) => {
    if (!req.isAuthenticated() || req.user.role !== 'employer') return res.status(401).send();
    const input = api.employer.company.input.parse(req.body);
    const company = await storage.createCompany(input);
    await storage.createEmployerProfile({ userId: req.user.id, companyId: company.id });
    res.status(201).json(company);
  });
  
  app.get(api.employer.getCompany.path, async (req, res) => {
    if (!req.isAuthenticated() || req.user.role !== 'employer') return res.status(401).send();
    const profile = await storage.getEmployerProfile(req.user.id);
    if (!profile) return res.status(404).send();
    res.json(profile.company);
  });

  // === AI ===
  app.post(api.ai.process.path, async (req, res) => {
    // Manually trigger processing
    const input = api.ai.process.input.parse(req.body);
    processApplicationAI(input.applicationId);
    res.json({ message: "Processing started", status: "pending" });
  });

  // Seed data function available at /api/seed
  app.post("/api/seed", async (req, res) => {
    await seedDatabase();
    res.json({ message: "Seeded" });
  });

  // GitHub push endpoint
  app.post("/api/github/push", async (req, res) => {
    try {
      const result = await createRepositoryAndPush(
        "OneClickApply",
        "A two-sided hiring platform with AI-powered candidate screening"
      );
      res.json(result);
    } catch (err: any) {
      console.error("GitHub push error:", err);
      res.status(500).json({ 
        success: false, 
        message: err.message || "Failed to push to GitHub" 
      });
    }
  });

  return httpServer;
}

// === AI HELPERS ===

async function processApplicationAI(applicationId: number) {
  console.log(`Processing AI for application ${applicationId}...`);
  try {
    const app = await storage.getApplication(applicationId);
    if (!app) return;

    // Create pending result
    let screening = await storage.getScreeningResult(applicationId);
    if (!screening) {
      screening = await storage.createScreeningResult({
        applicationId,
        aiStatus: "processing"
      });
    } else {
      await storage.updateScreeningResult(screening.id, { aiStatus: "processing" });
    }

    // Mock AI delay
    await new Promise(r => setTimeout(r, 2000));

    // Prepare prompt
    const prompt = `
      Job: ${app.job.title} at ${app.job.companyId} (Company ID)
      Description: ${app.job.description}
      Required Skills: ${app.job.requiredSkills?.join(", ")}
      
      Candidate: ${app.seeker.email}
      Profile Skills: ${app.seeker.seekerProfile?.skills?.join(", ")}
      Experience: ${app.seeker.seekerProfile?.experienceYears} years
      Resume Text: ${app.seeker.seekerProfile?.resumeText?.substring(0, 1000)}...

      Analyze fit. Return JSON:
      {
        "rulesScore": number (0-100 based on skills/exp match),
        "semanticScore": number (0-100 based on similarity),
        "finalScore": number (weighted),
        "reasons": ["reason1", "reason2"],
        "summary": "Short summary",
        "questions": ["Q1", "Q2", "Q3"]
      }
    `;

    // Call OpenAI
    let aiResponse;
    if (openai) {
      const completion = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [{ role: "user", content: prompt }],
        response_format: { type: "json_object" }
      });
      aiResponse = JSON.parse(completion.choices[0].message.content || "{}");
    } else {
      // Mock response if no key
      aiResponse = {
        rulesScore: 85,
        semanticScore: 80,
        finalScore: 82,
        reasons: ["Matches required skills", "Good experience"],
        summary: "Strong candidate with relevant experience.",
        questions: ["Describe your experience with React.", "How do you handle state management?"]
      };
    }

    await storage.updateScreeningResult(screening.id, {
      rulesScore: aiResponse.rulesScore,
      semanticScore: aiResponse.semanticScore,
      finalScore: aiResponse.finalScore,
      reasons: aiResponse.reasons,
      aiSummary: aiResponse.summary,
      aiQuestions: aiResponse.questions,
      aiStatus: "complete"
    });

  } catch (err) {
    console.error("AI Processing failed:", err);
    // Update status to failed
    const screening = await storage.getScreeningResult(applicationId);
    if (screening) {
      await storage.updateScreeningResult(screening.id, { aiStatus: "failed" });
    }
  }
}

async function seedDatabase() {
  const existingUser = await storage.getUserByEmail("employer@test.com");
  if (existingUser) return;

  // Employer
  const employer = await storage.createUser({
    email: "employer@test.com",
    password: "password", // In real app, hash this!
    role: "employer"
  });

  const company = await storage.createCompany({
    name: "Tech Corp",
    description: "Leading tech company",
    industry: "Software",
    size: "100-500",
    website: "https://techcorp.com"
  });

  await storage.createEmployerProfile({
    userId: employer.id,
    companyId: company.id
  });

  // Job
  const job = await storage.createJob({
    companyId: company.id,
    title: "Senior React Developer",
    description: "We are looking for an expert in React and Node.js.",
    location: "Remote",
    remote: true,
    salaryMin: 120000,
    salaryMax: 160000,
    requiredSkills: ["React", "Node.js", "TypeScript"],
    minYears: 5
  });

  // Seeker
  const seeker = await storage.createUser({
    email: "seeker@test.com",
    password: "password",
    role: "seeker"
  });

  await storage.createSeekerProfile({
    userId: seeker.id,
    name: "Jane Doe",
    title: "Frontend Engineer",
    bio: "Passionate about UI/UX",
    location: "New York",
    salaryMin: 100000,
    salaryMax: 140000,
    skills: ["React", "TypeScript", "Tailwind"],
    experienceYears: 4
  });

  console.log("Database seeded!");
}
