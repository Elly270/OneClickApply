
import passport from "passport";
import { Strategy as LocalStrategy } from "passport-local";
import { type Express } from "express";
import session from "express-session";
import createMemoryStore from "memorystore";
import { storage } from "./storage";
import { users } from "@shared/schema";

export function setupAuth(app: Express) {
  const MemoryStore = createMemoryStore(session);
  const sessionSettings: session.SessionOptions = {
    secret: process.env.SESSION_SECRET || "default_secret",
    resave: false,
    saveUninitialized: false,
    cookie: {},
    store: new MemoryStore({
      checkPeriod: 86400000,
    }),
  };

  if (app.get("env") === "production") {
    app.set("trust proxy", 1);
    sessionSettings.cookie = {
      secure: true,
    };
  }

  app.use(session(sessionSettings));
  app.use(passport.initialize());
  app.use(passport.session());

  passport.use(
    new LocalStrategy({ usernameField: "email" }, async (email, password, done) => {
      const user = await storage.getUserByEmail(email);
      // In a real app, verify password hash!
      if (!user || user.password !== password) {
        return done(null, false);
      } else {
        return done(null, user);
      }
    }),
  );

  passport.serializeUser((user, done) => {
    done(null, (user as any).id);
  });

  passport.deserializeUser(async (id, done) => {
    const user = await storage.getUser(id as number);
    done(null, user);
  });

  app.post("/api/auth/login", passport.authenticate("local"), (req, res) => {
    res.status(200).json(req.user);
  });

  app.post("/api/auth/logout", (req, res, next) => {
    req.logout((err) => {
      if (err) return next(err);
      res.sendStatus(200);
    });
  });

  app.get("/api/auth/me", (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    res.json(req.user);
  });
  
  app.post("/api/auth/signup", async (req, res) => {
    const { email, password, role } = req.body;
    if (await storage.getUserByEmail(email)) {
      return res.status(400).send("User already exists");
    }
    const user = await storage.createUser({ email, password, role: role || "seeker" });
    req.login(user, (err) => {
      if (err) return res.status(500).send(err);
      res.status(201).json(user);
    });
  });
}
