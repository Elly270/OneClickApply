
import { 
  users, companies, employerProfiles, jobSeekerProfiles, jobs, applications, screeningResults,
  type User, type InsertUser, type Company, type InsertCompany, type EmployerProfile, type InsertEmployerProfile,
  type JobSeekerProfile, type InsertJobSeekerProfile, type Job, type InsertJob, type Application, type InsertApplication,
  type ScreeningResult, type InsertScreeningResult
} from "@shared/schema";
import { db } from "./db";
import { eq, ilike, and, desc, or, gte, lte } from "drizzle-orm";

export interface IStorage {
  // User & Auth
  getUser(id: number): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;

  // Job Seeker
  getSeekerProfile(userId: number): Promise<JobSeekerProfile | undefined>;
  createSeekerProfile(profile: InsertJobSeekerProfile): Promise<JobSeekerProfile>;
  updateSeekerProfile(userId: number, profile: Partial<InsertJobSeekerProfile>): Promise<JobSeekerProfile>;

  // Employer & Company
  getEmployerProfile(userId: number): Promise<(EmployerProfile & { company: Company }) | undefined>;
  createEmployerProfile(profile: InsertEmployerProfile): Promise<EmployerProfile>;
  createCompany(company: InsertCompany): Promise<Company>;
  getCompany(id: number): Promise<Company | undefined>;

  // Jobs
  getJob(id: number): Promise<(Job & { company: Company }) | undefined>;
  createJob(job: InsertJob): Promise<Job>;
  listJobs(filters?: { title?: string, location?: string, remote?: boolean, minSalary?: number }): Promise<(Job & { company: Company })[]>;
  
  // Applications
  createApplication(app: InsertApplication): Promise<Application>;
  getApplication(id: number): Promise<(Application & { job: Job, seeker: User, screening?: ScreeningResult }) | undefined>;
  listApplicationsForSeeker(seekerId: number): Promise<(Application & { job: Job, company: Company, screening?: ScreeningResult })[]>;
  listApplicationsForJob(jobId: number): Promise<(Application & { seeker: User, profile: JobSeekerProfile, screening?: ScreeningResult })[]>;
  updateApplicationStatus(id: number, status: string): Promise<Application>;

  // Screening
  createScreeningResult(result: InsertScreeningResult): Promise<ScreeningResult>;
  getScreeningResult(applicationId: number): Promise<ScreeningResult | undefined>;
  updateScreeningResult(id: number, result: Partial<InsertScreeningResult>): Promise<ScreeningResult>;
}

export class DatabaseStorage implements IStorage {
  // User & Auth
  async getUser(id: number): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.email, email));
    return user;
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const [user] = await db.insert(users).values(insertUser).returning();
    return user;
  }

  // Job Seeker
  async getSeekerProfile(userId: number): Promise<JobSeekerProfile | undefined> {
    const [profile] = await db.select().from(jobSeekerProfiles).where(eq(jobSeekerProfiles.userId, userId));
    return profile;
  }

  async createSeekerProfile(insertProfile: InsertJobSeekerProfile): Promise<JobSeekerProfile> {
    const [profile] = await db.insert(jobSeekerProfiles).values(insertProfile).returning();
    return profile;
  }

  async updateSeekerProfile(userId: number, updates: Partial<InsertJobSeekerProfile>): Promise<JobSeekerProfile> {
    const [profile] = await db.update(jobSeekerProfiles)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(jobSeekerProfiles.userId, userId))
      .returning();
    return profile;
  }

  // Employer & Company
  async getEmployerProfile(userId: number): Promise<(EmployerProfile & { company: Company }) | undefined> {
    const [profile] = await db.select({
        profile: employerProfiles,
        company: companies
      })
      .from(employerProfiles)
      .innerJoin(companies, eq(employerProfiles.companyId, companies.id))
      .where(eq(employerProfiles.userId, userId));
    
    if (!profile) return undefined;
    return { ...profile.profile, company: profile.company };
  }

  async createEmployerProfile(insertProfile: InsertEmployerProfile): Promise<EmployerProfile> {
    const [profile] = await db.insert(employerProfiles).values(insertProfile).returning();
    return profile;
  }

  async createCompany(insertCompany: InsertCompany): Promise<Company> {
    const [company] = await db.insert(companies).values(insertCompany).returning();
    return company;
  }

  async getCompany(id: number): Promise<Company | undefined> {
    const [company] = await db.select().from(companies).where(eq(companies.id, id));
    return company;
  }

  // Jobs
  async getJob(id: number): Promise<(Job & { company: Company }) | undefined> {
    const [result] = await db.select({
      job: jobs,
      company: companies
    })
    .from(jobs)
    .innerJoin(companies, eq(jobs.companyId, companies.id))
    .where(eq(jobs.id, id));
    
    if (!result) return undefined;
    return { ...result.job, company: result.company };
  }

  async createJob(insertJob: InsertJob): Promise<Job> {
    const [job] = await db.insert(jobs).values(insertJob).returning();
    return job;
  }

  async listJobs(filters?: { title?: string, location?: string, remote?: boolean, minSalary?: number }): Promise<(Job & { company: Company })[]> {
    let conditions = [eq(jobs.active, true)];
    
    if (filters) {
      if (filters.title) conditions.push(ilike(jobs.title, `%${filters.title}%`));
      if (filters.location) conditions.push(ilike(jobs.location, `%${filters.location}%`));
      if (filters.remote !== undefined) conditions.push(eq(jobs.remote, filters.remote));
      if (filters.minSalary) conditions.push(gte(jobs.salaryMax, filters.minSalary));
    }

    const results = await db.select({
      job: jobs,
      company: companies
    })
    .from(jobs)
    .innerJoin(companies, eq(jobs.companyId, companies.id))
    .where(and(...conditions))
    .orderBy(desc(jobs.createdAt));

    return results.map(r => ({ ...r.job, company: r.company }));
  }

  // Applications
  async createApplication(insertApp: InsertApplication): Promise<Application> {
    const [app] = await db.insert(applications).values(insertApp).returning();
    return app;
  }

  async getApplication(id: number): Promise<(Application & { job: Job, seeker: User, screening?: ScreeningResult }) | undefined> {
    const [result] = await db.select({
      app: applications,
      job: jobs,
      seeker: users,
      screening: screeningResults
    })
    .from(applications)
    .innerJoin(jobs, eq(applications.jobId, jobs.id))
    .innerJoin(users, eq(applications.seekerId, users.id))
    .leftJoin(screeningResults, eq(applications.id, screeningResults.applicationId))
    .where(eq(applications.id, id));

    if (!result) return undefined;
    return { ...result.app, job: result.job, seeker: result.seeker, screening: result.screening || undefined };
  }

  async listApplicationsForSeeker(seekerId: number): Promise<(Application & { job: Job, company: Company, screening?: ScreeningResult })[]> {
    const results = await db.select({
      app: applications,
      job: jobs,
      company: companies,
      screening: screeningResults
    })
    .from(applications)
    .innerJoin(jobs, eq(applications.jobId, jobs.id))
    .innerJoin(companies, eq(jobs.companyId, companies.id))
    .leftJoin(screeningResults, eq(applications.id, screeningResults.applicationId))
    .where(eq(applications.seekerId, seekerId))
    .orderBy(desc(applications.createdAt));

    return results.map(r => ({ ...r.app, job: r.job, company: r.company, screening: r.screening || undefined }));
  }

  async listApplicationsForJob(jobId: number): Promise<(Application & { seeker: User, profile: JobSeekerProfile, screening?: ScreeningResult })[]> {
    const results = await db.select({
      app: applications,
      seeker: users,
      profile: jobSeekerProfiles,
      screening: screeningResults
    })
    .from(applications)
    .innerJoin(users, eq(applications.seekerId, users.id))
    .innerJoin(jobSeekerProfiles, eq(users.id, jobSeekerProfiles.userId))
    .leftJoin(screeningResults, eq(applications.id, screeningResults.applicationId))
    .where(eq(applications.jobId, jobId))
    .orderBy(desc(applications.createdAt));

    return results.map(r => ({ ...r.app, seeker: r.seeker, profile: r.profile, screening: r.screening || undefined }));
  }

  async updateApplicationStatus(id: number, status: string): Promise<Application> {
    const [app] = await db.update(applications)
      .set({ status, updatedAt: new Date() })
      .where(eq(applications.id, id))
      .returning();
    return app;
  }

  // Screening
  async createScreeningResult(insertResult: InsertScreeningResult): Promise<ScreeningResult> {
    const [result] = await db.insert(screeningResults).values(insertResult).returning();
    return result;
  }

  async getScreeningResult(applicationId: number): Promise<ScreeningResult | undefined> {
    const [result] = await db.select().from(screeningResults).where(eq(screeningResults.applicationId, applicationId));
    return result;
  }

  async updateScreeningResult(id: number, updates: Partial<InsertScreeningResult>): Promise<ScreeningResult> {
    const [result] = await db.update(screeningResults)
      .set(updates)
      .where(eq(screeningResults.id, id))
      .returning();
    return result;
  }
}

export const storage = new DatabaseStorage();
