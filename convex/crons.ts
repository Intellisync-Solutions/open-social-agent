import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

crons.interval(
  "enqueue due preparation runs",
  { minutes: 1 },
  internal.schedules.enqueueDue,
  { limit: 50 },
);

export default crons;
