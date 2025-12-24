
import { z } from 'zod';
export { 
  insertUserSchema, 
  insertCompanySchema, 
  insertJobSeekerProfileSchema, 
  insertJobSchema, 
  insertApplicationSchema,
  jobs,
  applications,
  companies,
  jobSeekerProfiles,
  screeningResults,
  users
} from './schema';
import { 
  insertUserSchema, 
  insertCompanySchema, 
  insertJobSeekerProfileSchema, 
  insertJobSchema, 
  insertApplicationSchema,
  jobs,
  applications,
  companies,
  jobSeekerProfiles,
  screeningResults,
  users
} from './schema';

export const errorSchemas = {
  validation: z.object({
    message: z.string(),
    field: z.string().optional(),
  }),
  notFound: z.object({
    message: z.string(),
  }),
  unauthorized: z.object({
    message: z.string(),
  }),
  internal: z.object({
    message: z.string(),
  }),
};

// Custom schemas
export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const signupSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  role: z.enum(["seeker", "employer"]),
});

export const resumeUploadResponseSchema = z.object({
  url: z.string(),
  text: z.string(),
});

export const jobFiltersSchema = z.object({
  title: z.string().optional(),
  location: z.string().optional(),
  remote: z.boolean().optional(),
  minSalary: z.number().optional(),
});

// === API CONTRACT ===
export const api = {
  auth: {
    login: {
      method: 'POST' as const,
      path: '/api/auth/login',
      input: loginSchema,
      responses: {
        200: z.custom<typeof users.$inferSelect>(),
        401: errorSchemas.unauthorized,
      }
    },
    signup: {
      method: 'POST' as const,
      path: '/api/auth/signup',
      input: signupSchema,
      responses: {
        201: z.custom<typeof users.$inferSelect>(),
        400: errorSchemas.validation,
      }
    },
    logout: {
      method: 'POST' as const,
      path: '/api/auth/logout',
      responses: {
        200: z.object({ message: z.string() }),
      }
    },
    me: {
      method: 'GET' as const,
      path: '/api/auth/me',
      responses: {
        200: z.custom<typeof users.$inferSelect>(),
        401: errorSchemas.unauthorized,
      }
    }
  },
  jobs: {
    list: {
      method: 'GET' as const,
      path: '/api/jobs',
      input: jobFiltersSchema.optional(),
      responses: {
        200: z.array(z.custom<typeof jobs.$inferSelect & { company: typeof companies.$inferSelect }>()),
      },
    },
    create: {
      method: 'POST' as const,
      path: '/api/jobs',
      input: insertJobSchema,
      responses: {
        201: z.custom<typeof jobs.$inferSelect>(),
        401: errorSchemas.unauthorized,
      },
    },
    get: {
      method: 'GET' as const,
      path: '/api/jobs/:id',
      responses: {
        200: z.custom<typeof jobs.$inferSelect & { company: typeof companies.$inferSelect }>(),
        404: errorSchemas.notFound,
      },
    },
  },
  applications: {
    apply: {
      method: 'POST' as const,
      path: '/api/applications',
      input: z.object({
        jobId: z.number(),
        note: z.string().optional(),
      }),
      responses: {
        201: z.custom<typeof applications.$inferSelect>(),
        400: errorSchemas.validation,
      }
    },
    list: {
      method: 'GET' as const,
      path: '/api/applications', // For seeker
      responses: {
        200: z.array(z.custom<typeof applications.$inferSelect & { job: typeof jobs.$inferSelect; company: typeof companies.$inferSelect; screening?: typeof screeningResults.$inferSelect }>()),
      }
    },
    listForJob: {
      method: 'GET' as const,
      path: '/api/employer/jobs/:id/applications',
      responses: {
        200: z.array(z.custom<typeof applications.$inferSelect & { seeker: typeof users.$inferSelect; profile: typeof jobSeekerProfiles.$inferSelect; screening?: typeof screeningResults.$inferSelect }>()),
        403: errorSchemas.unauthorized,
      }
    },
    updateStatus: {
      method: 'PATCH' as const,
      path: '/api/applications/:id/status',
      input: z.object({
        status: z.enum(["applied", "screened", "shortlisted", "interview", "offer", "hired", "rejected"]),
      }),
      responses: {
        200: z.custom<typeof applications.$inferSelect>(),
      }
    }
  },
  seeker: {
    profile: {
      method: 'GET' as const,
      path: '/api/seeker/profile',
      responses: {
        200: z.custom<typeof jobSeekerProfiles.$inferSelect>(),
        404: errorSchemas.notFound,
      }
    },
    updateProfile: {
      method: 'PUT' as const,
      path: '/api/seeker/profile',
      input: insertJobSeekerProfileSchema.partial(),
      responses: {
        200: z.custom<typeof jobSeekerProfiles.$inferSelect>(),
      }
    },
    uploadResume: {
      method: 'POST' as const,
      path: '/api/resume/upload',
      // input is FormData
      responses: {
        200: resumeUploadResponseSchema,
      }
    }
  },
  employer: {
    company: {
      method: 'POST' as const,
      path: '/api/employer/company',
      input: insertCompanySchema,
      responses: {
        201: z.custom<typeof companies.$inferSelect>(),
      }
    },
    getCompany: {
      method: 'GET' as const,
      path: '/api/employer/company',
      responses: {
        200: z.custom<typeof companies.$inferSelect>(),
      }
    }
  },
  ai: {
    process: {
      method: 'POST' as const,
      path: '/api/ai/process',
      input: z.object({ applicationId: z.number() }),
      responses: {
        200: z.object({ message: z.string(), status: z.string() }),
      }
    }
  }
};

export function buildUrl(path: string, params?: Record<string, string | number>): string {
  let url = path;
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      if (url.includes(`:${key}`)) {
        url = url.replace(`:${key}`, String(value));
      }
    });
  }
  return url;
}
