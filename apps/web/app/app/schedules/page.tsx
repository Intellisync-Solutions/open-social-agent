"use client";

import type { ScheduleInput } from "@open-social-agent/contracts";
import { useMutation, useQuery } from "convex/react";
import {
  Archive,
  Pause,
  Play,
  RotateCcw,
  Save,
  Sparkles,
  Trash2,
} from "lucide-react";
import { useState } from "react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import {
  AppShell,
  EmptyDesk,
  formatMoment,
  StateStamp,
} from "@/components/workbench/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Status = "active" | "paused" | "archived";
const initialSchedule: ScheduleInput = {
  name: "Weekly evidence draft",
  cadence: "weekly",
  timezone: "America/Toronto",
  localTime: "09:30",
  weekday: 2,
};

export default function SchedulesPage() {
  const [status, setStatus] = useState<Status>("active");
  const profiles = useQuery(api.automationProfiles.listMine, {
    status: "active",
  });
  const schedules = useQuery(api.schedules.listMine, { status });
  const create = useMutation(api.schedules.createMine);
  const update = useMutation(api.schedules.updateMine);
  const setLifecycle = useMutation(api.schedules.setStatusMine);
  const runNow = useMutation(api.schedules.runNowMine);
  const purge = useMutation(api.schedules.purgeMine);
  const [profileId, setProfileId] = useState<Id<"automationProfiles"> | "">("");
  const [editingId, setEditingId] = useState<Id<"schedules"> | null>(null);
  const [draft, setDraft] = useState(initialSchedule);
  const [message, setMessage] = useState<string | null>(null);

  async function save() {
    setMessage(null);
    try {
      if (editingId) await update({ scheduleId: editingId, ...draft });
      else {
        if (!profileId) throw new Error("SELECT_PROFILE");
        await create({ profileId, ...draft });
      }
      setEditingId(null);
      setDraft(initialSchedule);
      setMessage(
        "Schedule saved paused. Resume it only when the runner is ready.",
      );
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "SCHEDULE_SAVE_FAILED",
      );
    }
  }

  return (
    <AppShell
      eyebrow="Schedule preparation"
      title="Set a rhythm, not a permission."
    >
      <section className="split-workbench">
        <div className="form-sheet compact-sheet">
          <div className="sheet-heading">
            <span>{editingId ? "EDIT" : "NEW"}</span>
            <div>
              <h2>
                {editingId
                  ? "Revise schedule"
                  : "Create a preparation schedule"}
              </h2>
              <p>
                New schedules are paused. A due occurrence queues one immutable
                run.
              </p>
            </div>
          </div>
          <div className="workbench-fields">
            {!editingId ? (
              <Field label="Automation profile" full>
                <select
                  value={profileId}
                  onChange={(e) =>
                    setProfileId(e.target.value as Id<"automationProfiles">)
                  }
                >
                  <option value="">Select an active profile</option>
                  {profiles?.map((profile) => (
                    <option key={profile._id} value={profile._id}>
                      {profile.name}
                    </option>
                  ))}
                </select>
              </Field>
            ) : null}
            <Field label="Schedule name" full>
              <Input
                value={draft.name}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              />
            </Field>
            <Field label="Cadence">
              <select
                value={draft.cadence}
                onChange={(e) => {
                  const cadence = e.target.value as ScheduleInput["cadence"];
                  setDraft({
                    ...draft,
                    cadence,
                    weekday:
                      cadence === "weekly" ? (draft.weekday ?? 2) : undefined,
                    advancedCron:
                      cadence === "advanced"
                        ? (draft.advancedCron ?? "30 9 * * 2")
                        : undefined,
                  });
                }}
              >
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
                <option value="advanced">Advanced cron</option>
              </select>
            </Field>
            <Field label="Local time">
              <Input
                type="time"
                value={draft.localTime}
                onChange={(e) =>
                  setDraft({ ...draft, localTime: e.target.value })
                }
              />
            </Field>
            <Field label="IANA timezone" full>
              <Input
                value={draft.timezone}
                onChange={(e) =>
                  setDraft({ ...draft, timezone: e.target.value })
                }
              />
            </Field>
            {draft.cadence === "weekly" ? (
              <Field label="Weekday" full>
                <select
                  value={draft.weekday}
                  onChange={(e) =>
                    setDraft({ ...draft, weekday: Number(e.target.value) })
                  }
                >
                  {[
                    "Sunday",
                    "Monday",
                    "Tuesday",
                    "Wednesday",
                    "Thursday",
                    "Friday",
                    "Saturday",
                  ].map((day, index) => (
                    <option key={day} value={index}>
                      {day}
                    </option>
                  ))}
                </select>
              </Field>
            ) : null}
            {draft.cadence === "advanced" ? (
              <Field label="Five-field cron" full>
                <Input
                  value={draft.advancedCron ?? ""}
                  onChange={(e) =>
                    setDraft({ ...draft, advancedCron: e.target.value })
                  }
                />
                <small>Validated in the selected IANA timezone.</small>
              </Field>
            ) : null}
          </div>
          <div className="form-sheet-actions">
            <Button className="primary-action" onClick={() => void save()}>
              <Save size={15} />{" "}
              {editingId ? "Save revision" : "Create paused schedule"}
            </Button>
            {editingId ? (
              <Button
                variant="outline"
                onClick={() => {
                  setEditingId(null);
                  setDraft(initialSchedule);
                }}
              >
                Cancel
              </Button>
            ) : null}
            <span role="status">{message}</span>
          </div>
        </div>

        <div className="record-stack">
          <div className="filter-tabs">
            {(["active", "paused", "archived"] as Status[]).map((value) => (
              <button
                className={status === value ? "active" : ""}
                key={value}
                onClick={() => setStatus(value)}
              >
                {value}
              </button>
            ))}
          </div>
          {schedules === undefined ? (
            <p className="loading-copy">Reading schedules…</p>
          ) : schedules.length === 0 ? (
            <EmptyDesk
              number="00"
              title={`No ${status} schedules`}
              copy="A schedule creates preparation work. It never grants publication approval."
            />
          ) : (
            schedules.map((schedule) => (
              <article className="record-card schedule-card" key={schedule._id}>
                <div className="record-card-top">
                  <StateStamp state={schedule.status} />
                  <small>revision {schedule.revision}</small>
                </div>
                <h2>{schedule.name}</h2>
                <p>
                  {schedule.cadence} · {schedule.localTime} ·{" "}
                  {schedule.timezone}
                </p>
                <dl>
                  <div>
                    <dt>Next due</dt>
                    <dd>
                      {schedule.nextRunAt
                        ? formatMoment(schedule.nextRunAt)
                        : "Not scheduled"}
                    </dd>
                  </div>
                </dl>
                <div className="record-actions">
                  {schedule.status !== "archived" ? (
                    <>
                      <Button
                        variant="outline"
                        onClick={() => {
                          setEditingId(schedule._id);
                          setDraft({
                            name: schedule.name,
                            cadence: schedule.cadence,
                            timezone: schedule.timezone,
                            localTime: schedule.localTime,
                            weekday: schedule.weekday,
                            advancedCron: schedule.advancedCron,
                          });
                          window.scrollTo({ top: 0, behavior: "smooth" });
                        }}
                      >
                        Edit
                      </Button>
                      <Button
                        variant="outline"
                        onClick={() =>
                          void setLifecycle({
                            scheduleId: schedule._id,
                            status:
                              schedule.status === "active"
                                ? "paused"
                                : "active",
                          })
                        }
                      >
                        {schedule.status === "active" ? (
                          <Pause size={14} />
                        ) : (
                          <Play size={14} />
                        )}
                        {schedule.status === "active" ? "Pause" : "Resume"}
                      </Button>
                      <Button
                        variant="outline"
                        onClick={async () => {
                          const requestId = crypto
                            .randomUUID()
                            .replaceAll("-", "");
                          const runId = await runNow({
                            scheduleId: schedule._id,
                            requestId,
                          });
                          setMessage(
                            `Run ${runId} queued. The local runner must claim it.`,
                          );
                        }}
                      >
                        <Sparkles size={14} /> Run now
                      </Button>
                      <Button
                        variant="outline"
                        onClick={() =>
                          void setLifecycle({
                            scheduleId: schedule._id,
                            status: "archived",
                          })
                        }
                      >
                        <Archive size={14} /> Archive
                      </Button>
                    </>
                  ) : (
                    <>
                      <Button
                        variant="outline"
                        onClick={() =>
                          void setLifecycle({
                            scheduleId: schedule._id,
                            status: "paused",
                          })
                        }
                      >
                        <RotateCcw size={14} /> Restore paused
                      </Button>
                      <Button
                        variant="outline"
                        onClick={() => {
                          if (
                            window.confirm(
                              `Permanently purge ${schedule.name}? Only schedules without run history can be purged.`,
                            )
                          )
                            void purge({
                              scheduleId: schedule._id,
                              confirmName: schedule.name,
                            });
                        }}
                      >
                        <Trash2 size={14} /> Purge
                      </Button>
                    </>
                  )}
                </div>
              </article>
            ))
          )}
        </div>
      </section>
    </AppShell>
  );
}

function Field({
  label,
  children,
  full = false,
}: {
  label: string;
  children: React.ReactNode;
  full?: boolean;
}) {
  return (
    <label className={`workbench-field${full ? " full" : ""}`}>
      <span>{label}</span>
      {children}
    </label>
  );
}
