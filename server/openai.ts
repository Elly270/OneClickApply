
import OpenAI from "openai";

// the user will set OPENAI_API_KEY in the environment
// if it's not set, we can just log a warning and return mock data
export const openai = process.env.OPENAI_API_KEY 
  ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  : null;
