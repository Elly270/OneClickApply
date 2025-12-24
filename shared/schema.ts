
import { pgTable, text, serial, integer, boolean, timestamp, jsonb, real } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// === TABLE DEFINITIONS ===

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  email: text("email").notNull().unique(),
  password: text("password").notNull(),
  role: text("role", { enum: ["seeker", "employer"] }).notNull().default("seeker"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const companies = pgTable("companies", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description").notNull(),
  industry: text("industry"),
  size: text("size"), // e.g., "1-10", "11-50"
  website: text("website"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const employerProfiles = pgTable("employer_profiles", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id),
  companyId: integer("company_id").notNull().references(() => companies.id),
});

export const jobSeekerProfiles = pgTable("job_seeker_profiles", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id),
  name: text("name").notNull(),
  title: text("title"), // Current title
  bio: text("bio"),
  location: text("location"),
  salaryMin: integer("salary_min"),
  salaryMax: integer("salary_max"),
  skills: text("skills").array(), // Array of strings
  experienceYears: integer("experience_years"),
  resumeUrl: text("resume_url"),
  resumeText: text("resume_text"), // Extracted text
  embedding: jsonb("embedding"), // Store as JSON array of numbers for compatibility
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const jobs = pgTable("jobs", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").notNull().references(() => companies.id),
  title: text("title").notNull(),
  description: text("description").notNull(),
  location: text("location").notNull(),
  remote: boolean("remote").default(false),
  salaryMin: integer("salary_min"),
  salaryMax: integer("salary_max"),
  requiredSkills: text("required_skills").array(),
  minYears: integer("min_years").default(0),
  active: boolean("active").default(true),
  embedding: jsonb("embedding"), // Store as JSON array of numbers
  createdAt: timestamp("created_at").defaultNow(),
});

export const applications = pgTable("applications", {
  id: serial("id").primaryKey(),
  jobId: integer("job_id").notNull().references(() => jobs.id),
  seekerId: integer("seeker_id").notNull().references(() => users.id),
  status: text("status", { enum: ["applied", "screened", "shortlisted", "interview", "offer", "hired", "rejected"] }).default("applied"),
  note: text("note"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const screeningResults = pgTable("screening_results", {
  id: serial("id").primaryKey(),
  applicationId: integer("application_id").notNull().references(() => applications.id),
  rulesScore: integer("rules_score"),
  semanticScore: integer("semantic_score"),
  finalScore: integer("final_score"),
  reasons: jsonb("reasons"), // Array of strings or object
  aiSummary: text("ai_summary"),
  aiQuestions: jsonb("ai_questions"), // Array of strings
  aiStatus: text("ai_status", { enum: ["pending", "processing", "complete", "failed"] }).default("pending"),
  createdAt: timestamp("created_at").defaultNow(),
});

// === RELATIONS ===

export const usersRelations = relations(users, ({ one, many }) => ({
  employerProfile: one(employerProfiles, {
    fields: [users.id],
    references: [employerProfiles.userId],
  }),
  seekerProfile: one(jobSeekerProfiles, {
    fields: [users.id],
    references: [jobSeekerProfiles.userId],
  }),
  applications: many(applications), // As seeker
}));

export const companiesRelations = relations(companies, ({ many }) => ({
  jobs: many(jobs),
  employers: many(employerProfiles),
}));

export const employerProfilesRelations = relations(employerProfiles, ({ one }) => ({
  user: one(users, {
    fields: [employerProfiles.userId],
    references: [users.id],
  }),
  company: one(companies, {
    fields: [employerProfiles.companyId],
    references: [companies.id],
  }),
}));

export const jobSeekerProfilesRelations = relations(jobSeekerProfiles, ({ one }) => ({
  user: one(users, {
    fields: [jobSeekerProfiles.userId],
    references: [users.id],
  }),
}));

export const jobsRelations = relations(jobs, ({ one, many }) => ({
  company: one(companies, {
    fields: [jobs.companyId],
    references: [companies.id],
  }),
  applications: many(applications),
}));

export const applicationsRelations = relations(applications, ({ one }) => ({
  job: one(jobs, {
    fields: [applications.jobId],
    references: [jobs.id],
  }),
  seeker: one(users, {
    fields: [applications.seekerId],
    references: [users.id],
  }),
  screeningResult: one(screeningResults, {
    fields: [applications.id],
    references: [screeningResults.applicationId],
  }),
}));

export const screeningResultsRelations = relations(screeningResults, ({ one }) => ({
  application: one(applications, {
    fields: [screeningResults.applicationId],
    references: [applications.id],
  }),
}));

// === INSERTS & TYPES ===

export const insertUserSchema = createInsertSchema(users).omit({ id: true, createdAt: true });
export const insertCompanySchema = createInsertSchema(companies).omit({ id: true, createdAt: true });
export const insertEmployerProfileSchema = createInsertSchema(employerProfiles).omit({ id: true });
export const insertJobSeekerProfileSchema = createInsertSchema(jobSeekerProfiles).omit({ id: true, createdAt: true, updatedAt: true, embedding: true, resumeText: true });
export const insertJobSchema = createInsertSchema(jobs).omit({ id: true, createdAt: true, embedding: true });
export const insertApplicationSchema = createInsertSchema(applications).omit({ id: true, createdAt: true, updatedAt: true });
export const insertScreeningResultSchema = createInsertSchema(screeningResults).omit({ id: true, createdAt: true });

export type User = typeof users.$inferSelect;
export type Company = typeof companies.$inferSelect;
export type EmployerProfile = typeof employerProfiles.$inferSelect;
export type JobSeekerProfile = typeof jobSeekerProfiles.$inferSelect;
export type Job = typeof jobs.$inferSelect;
export type Application = typeof applications.$inferSelect;
export type ScreeningResult = typeof screeningResults.$inferSelect;

export type InsertUser = z.infer<typeof insertUserSchema>;
export type InsertCompany = z.infer<typeof insertCompanySchema>;
export type InsertJobSeekerProfile = z.infer<typeof insertJobSeekerProfileSchema>;
export type InsertJob = z.infer<typeof insertJobSchema>;
export type InsertApplication = z.infer<typeof insertApplicationSchema>;
