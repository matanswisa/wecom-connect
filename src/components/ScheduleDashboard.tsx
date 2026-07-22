"use client";

import Image from "next/image";
import {
  AlertTriangle,
  Bell,
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Download,
  LogOut,
  MessageSquare,
  Plus,
  Repeat2,
  Search,
  ShieldAlert,
  UserRound,
  UsersRound,
  X
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState, type CSSProperties } from "react";
import { addDays, formatHebrewDate, getScheduleDays } from "@/lib/dates";
import { getEmployeeColor } from "@/lib/employeeColors";
import { buildScheduleCsv, scheduleExportFilename } from "@/lib/scheduleExport";
import { SHIFT_DEFINITIONS, getShiftTypes } from "@/lib/shifts";
import type {
  AvailabilityBlock,
  AvailabilityStatus,
  Employee,
  EmployeeSummary,
  ShiftAssignment,
  ShiftSwapRequest,
  ShiftType,
  User
} from "@/lib/types";

interface SchedulePayload {
  weekStart: string;
  employees: Employee[];
  assignments: ShiftAssignment[];
  availabilityBlocks: AvailabilityBlock[];
  swaps: ShiftSwapRequest[];
  summaries: EmployeeSummary[];
}

interface PendingAssignment {
  dayIndex: number;
  shiftType: ShiftType;
  warnings: string[];
}

const EMPTY_SCHEDULE: SchedulePayload = {
  weekStart: "",
  employees: [],
  assignments: [],
  availabilityBlocks: [],
  swaps: [],
  summaries: []
};

export function ScheduleDashboard({
  currentUser,
  initialWeekStart
}: {
  currentUser: User;
  initialWeekStart: string;
}) {
  const [weekStart, setWeekStart] = useState(initialWeekStart);
  const [schedule, setSchedule] = useState<SchedulePayload>(EMPTY_SCHEDULE);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState("");
  const [pendingAssignment, setPendingAssignment] = useState<PendingAssignment | null>(null);
  const [toast, setToast] = useState("");
  const [isLoading, setIsLoading] = useState(true);

  const days = useMemo(() => getScheduleDays(weekStart), [weekStart]);
  const assignmentsByCell = useMemo(() => groupAssignments(schedule.assignments), [schedule.assignments]);
  const employeesById = useMemo(
    () => new Map(schedule.employees.map((employee) => [employee.id, employee])),
    [schedule.employees]
  );
  const availabilityEmployees = useMemo(
    () =>
      currentUser.role === "MANAGER"
        ? schedule.employees
        : schedule.employees.filter((employee) => employee.userId === currentUser.id),
    [currentUser.id, currentUser.role, schedule.employees]
  );

  const loadSchedule = useCallback(async (nextWeekStart = weekStart) => {
    setIsLoading(true);
    const response = await fetch(`/api/schedule?weekStart=${nextWeekStart}`);
    if (response.ok) {
      const payload = (await response.json()) as SchedulePayload;
      setSchedule(payload);
      const ownEmployee = payload.employees.find((employee) => employee.userId === currentUser.id);
      setSelectedEmployeeId(
        (current) => current || ownEmployee?.id || payload.employees[0]?.id || ""
      );
    }
    setIsLoading(false);
  }, [currentUser.id, weekStart]);

  useEffect(() => {
    void loadSchedule(weekStart);
  }, [weekStart, loadSchedule]);

  async function assignShift(
    dayIndex: number,
    shiftType: ShiftType,
    acknowledgeWarnings = false
  ) {
    if (!selectedEmployeeId) {
      setToast("צריך לבחור עובד לשיבוץ.");
      return;
    }

    const response = await fetch("/api/assignments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        employeeId: selectedEmployeeId,
        weekStart,
        dayIndex,
        shiftType,
        acknowledgeWarnings
      })
    });
    const body = await response.json();

    if (!response.ok) {
      const warnings = (body.details?.warnings ?? []).map(
        (warning: { message: string }) => warning.message
      );
      if (warnings.length > 0 && !(body.details?.errors?.length > 0)) {
        setPendingAssignment({ dayIndex, shiftType, warnings });
        return;
      }
      setToast(body.details?.errors?.[0]?.message ?? body.error ?? "השיבוץ נכשל.");
      return;
    }

    setPendingAssignment(null);
    setToast(acknowledgeWarnings ? "השיבוץ נשמר לאחר אישור האזהרה." : "השיבוץ נשמר.");
    await loadSchedule();
  }

  async function removeAssignment(id: string) {
    await fetch(`/api/assignments/${id}`, { method: "DELETE" });
    await loadSchedule();
  }

  async function setShiftAvailability(
    employeeId: string,
    dayIndex: number,
    shiftType: ShiftType,
    status: AvailabilityStatus | "AVAILABLE"
  ) {
    const existing = findShiftAvailability(
      schedule.availabilityBlocks,
      employeeId,
      dayIndex,
      shiftType
    );
    if (status === "AVAILABLE" && !existing) {
      return;
    }
    const response = status === "AVAILABLE" && existing
      ? await fetch(`/api/availability/${existing.id}`, { method: "DELETE" })
      : await fetch("/api/availability", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            employeeId,
            weekStart,
            dayIndex,
            shiftType,
            status,
            reason: availabilityStatusLabel(status)
          })
        });

    setToast(response.ok ? "הזמינות עודכנה." : "עדכון הזמינות נכשל.");
    if (response.ok) {
      await loadSchedule();
    }
  }

  async function toggleTimeOff(employeeId: string, dayIndex: number) {
    const existing = findTimeOff(schedule.availabilityBlocks, employeeId, dayIndex);
    const response = existing
      ? await fetch(`/api/availability/${existing.id}`, { method: "DELETE" })
      : await fetch("/api/availability", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            employeeId,
            weekStart,
            dayIndex,
            status: "TIME_OFF",
            reason: "Time Off"
          })
        });

    setToast(response.ok ? (existing ? "החופשה הוסרה." : "החופשה נשמרה.") : "עדכון החופשה נכשל.");
    if (response.ok) {
      await loadSchedule();
    }
  }

  async function createSwap(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const response = await fetch("/api/swaps", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(Object.fromEntries(formData.entries()))
    });

    setToast(response.ok ? "בקשת ההחלפה נשלחה." : "בקשת ההחלפה נכשלה.");
    if (response.ok) {
      event.currentTarget.reset();
      await loadSchedule();
    }
  }

  async function decideSwap(id: string, action: string) {
    const response = await fetch(`/api/swaps/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action })
    });
    setToast(response.ok ? "סטטוס ההחלפה עודכן." : "עדכון ההחלפה נכשל.");
    await loadSchedule();
  }

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/login";
  }

  function exportSchedule() {
    const csv = buildScheduleCsv({
      weekStart,
      employees: schedule.employees,
      assignments: schedule.assignments,
      summaries: schedule.summaries
    });
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = scheduleExportFilename(weekStart);
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    setToast("טבלת השיבוץ יוצאה בהצלחה.");
  }

  return (
    <div className="app-frame">
      <aside className="icon-rail" aria-label="ניווט">
        <div className="rail-logo">
          <Image src="/wecom-logo.svg" alt="wecom" width={92} height={42} priority />
        </div>
        <button title="לוח משמרות" className="rail-button active">
          <CalendarDays size={20} />
        </button>
        <button title="עובדים" className="rail-button">
          <UsersRound size={20} />
        </button>
        <button title="התראות" className="rail-button">
          <Bell size={20} />
        </button>
        <button title="החלפות" className="rail-button">
          <Repeat2 size={20} />
        </button>
      </aside>

      <div className="workspace">
        <header className="topbar">
          <div className="topbar-logo">
            <Image src="/wecom-logo.svg" alt="wecom" width={104} height={47} priority />
            <span>connect</span>
          </div>
          <div className="search-box">
            <Search size={18} />
            <input placeholder="חיפוש עובד, משמרת או תאריך" />
          </div>
          <div className="topbar-actions">
            <span className="trial-pill">ניהול משמרות</span>
            <span className="user-pill">
              <UserRound size={18} />
              {currentUser.name}
            </span>
            <button className="icon-button" onClick={logout} title="יציאה">
              <LogOut size={18} />
            </button>
          </div>
        </header>

        <main className="scheduler-page">
          <section className="schedule-toolbar">
            <div>
              <p className="eyebrow">Wecomconnect</p>
              <h1>לוח משמרות שבועי</h1>
            </div>
            <div className="toolbar-controls">
              <button className="soft-button" onClick={() => setWeekStart(addDays(weekStart, -7))}>
                <ChevronRight size={18} />
              </button>
              <div className="week-pill">
                {formatHebrewDate(weekStart)} - {formatHebrewDate(addDays(weekStart, 6))}
              </div>
              <button className="soft-button" onClick={() => setWeekStart(addDays(weekStart, 7))}>
                <ChevronLeft size={18} />
              </button>
              <button className="export-button" onClick={exportSchedule}>
                <Download size={17} />
                ייצוא טבלה
              </button>
              <div
                className="employee-select-control"
                style={employeeColorStyle(employeesById.get(selectedEmployeeId))}
              >
                <i className="employee-color-dot" aria-hidden="true" />
                <select
                  value={selectedEmployeeId}
                  disabled={currentUser.role !== "MANAGER"}
                  onChange={(event) => setSelectedEmployeeId(event.target.value)}
                >
                  {availabilityEmployees.map((employee) => (
                    <option value={employee.id} key={employee.id}>
                      {employee.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </section>

          <section className="main-grid">
            <div className="schedule-panel">
              <div className="grid-header">
                <div className="shift-label-column">משמרת</div>
                {days.map((day) => (
                  <div className="day-header" key={day.index}>
                    <strong>{day.label}</strong>
                    <span>{formatHebrewDate(day.date)}</span>
                  </div>
                ))}
              </div>

              {getShiftTypes().map((shiftType) => (
                <div className="shift-row" key={shiftType}>
                  <div className={`shift-name ${SHIFT_DEFINITIONS[shiftType].tone}`}>
                    <Clock3 size={18} />
                    <strong>{SHIFT_DEFINITIONS[shiftType].label}</strong>
                    <span>
                      {SHIFT_DEFINITIONS[shiftType].startsAt}-{SHIFT_DEFINITIONS[shiftType].endsAt}
                    </span>
                  </div>
                  {days.map((day) => {
                    const key = cellKey(day.index, shiftType);
                    const assignments = assignmentsByCell.get(key) ?? [];
                    const selectedEmployeeBlocked = isUnavailableForShift(
                      schedule.availabilityBlocks,
                      selectedEmployeeId,
                      day.index,
                      shiftType
                    );
                    const selectedEmployeePreferred = Boolean(
                      findShiftAvailability(
                        schedule.availabilityBlocks,
                        selectedEmployeeId,
                        day.index,
                        shiftType
                      )?.status === "PREFERRED"
                    );
                    return (
                      <div className="shift-cell" key={key}>
                        <button
                          className={`add-shift ${selectedEmployeeBlocked ? "has-constraint" : ""} ${selectedEmployeePreferred ? "is-preferred" : ""}`}
                          onClick={() => assignShift(day.index, shiftType)}
                          disabled={currentUser.role !== "MANAGER"}
                        >
                          {selectedEmployeeBlocked ? <ShieldAlert size={16} /> : <Plus size={16} />}
                          {selectedEmployeeBlocked
                            ? "שיבוץ בחריגה"
                            : selectedEmployeePreferred
                              ? "שיבוץ מועדף"
                              : "שיבוץ"}
                        </button>
                        <div className="assigned-list">
                          {assignments.map((assignment) => {
                            const employee = employeesById.get(assignment.employeeId);
                            return (
                            <div
                              className="employee-chip"
                              key={assignment.id}
                              style={employeeColorStyle(employee)}
                            >
                              <span>
                                <i className="employee-color-dot" aria-hidden="true" />
                                {isUnavailableForShift(
                                  schedule.availabilityBlocks,
                                  assignment.employeeId,
                                  day.index,
                                  shiftType
                                ) ? (
                                  <ShieldAlert
                                    className="assignment-warning"
                                    size={14}
                                    aria-label="שובץ בניגוד לאילוץ"
                                  />
                                ) : null}
                                {employee?.name ?? "עובד"}
                              </span>
                              {currentUser.role === "MANAGER" ? (
                                <button
                                  onClick={() => removeAssignment(assignment.id)}
                                  title="הסר שיבוץ"
                                >
                                  <X size={14} />
                                </button>
                              ) : null}
                            </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>

            <aside className="side-panel">
              <section className="summary-block">
                <div className="panel-title">
                  <UsersRound size={18} />
                  <h2>סיכום עובדים</h2>
                </div>
                <div className="summary-list">
                  {schedule.summaries.map((summary) => {
                    const employee = employeesById.get(summary.employeeId);
                    return (
                      <div
                        className="summary-item"
                        key={summary.employeeId}
                        style={employeeColorStyle(employee)}
                      >
                        <div>
                          <strong className="employee-name-with-color">
                            <i className="employee-color-dot" aria-hidden="true" />
                            {employee?.name}
                          </strong>
                          <span>
                            {summary.shiftCount}/{summary.maxShifts} משמרות
                          </span>
                        </div>
                        <b>{summary.workHours} שעות</b>
                      </div>
                    );
                  })}
                </div>
              </section>

              <section className="summary-block">
                <div className="panel-title">
                  <Repeat2 size={18} />
                  <h2>החלפות</h2>
                </div>
                <form className="compact-form" onSubmit={createSwap}>
                  <select name="requesterAssignmentId" required defaultValue="">
                    <option value="" disabled>
                      משמרת מקור
                    </option>
                    {schedule.assignments.map((assignment) => (
                      <option value={assignment.id} key={assignment.id}>
                        {employeesById.get(assignment.employeeId)?.name} · יום {assignment.dayIndex + 1} ·{" "}
                        {SHIFT_DEFINITIONS[assignment.shiftType].label}
                      </option>
                    ))}
                  </select>
                  <select name="targetEmployeeId" required defaultValue="">
                    <option value="" disabled>
                      עובד יעד
                    </option>
                    {schedule.employees.map((employee) => (
                      <option value={employee.id} key={employee.id}>
                        {employee.name}
                      </option>
                    ))}
                  </select>
                  <button className="primary-button">שלח החלפה</button>
                </form>
                <div className="swap-list">
                  {schedule.swaps.map((swap) => (
                    <div className="swap-item" key={swap.id}>
                      <span>{swapStatusLabel(swap.status)}</span>
                      <div className="swap-actions">
                        {swap.status === "PENDING_EMPLOYEE" ? (
                          <>
                            <button onClick={() => decideSwap(swap.id, "approve_employee")}>
                              <Check size={14} />
                            </button>
                            <button onClick={() => decideSwap(swap.id, "decline_employee")}>
                              <X size={14} />
                            </button>
                          </>
                        ) : null}
                        {swap.status === "PENDING_MANAGER" && currentUser.role === "MANAGER" ? (
                          <>
                            <button onClick={() => decideSwap(swap.id, "approve_manager")}>
                              <Check size={14} />
                            </button>
                            <button onClick={() => decideSwap(swap.id, "decline_manager")}>
                              <X size={14} />
                            </button>
                          </>
                        ) : null}
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            </aside>
          </section>

          <section className="availability-panel">
            <div className="availability-heading">
              <div className="panel-title">
                <ShieldAlert size={18} />
                <h2>אילוצים שבועיים</h2>
              </div>
              <div className="availability-legend">
                <span className="legend-morning">בוקר</span>
                <span className="legend-evening">ערב</span>
                <span className="legend-night">לילה</span>
                <span className="legend-time-off">Time Off</span>
                <span className="legend-unavailable">לא זמין</span>
                <span className="legend-preferred">מעוניין לעבוד</span>
                <span className="legend-open">משמרת פתוחה</span>
              </div>
            </div>
            <div className="availability-scroll">
              <div className="availability-grid availability-header">
                <div>עובד</div>
                {days.map((day) => (
                  <div key={day.index}>
                    <strong>{day.label}</strong>
                    <span>{formatHebrewDate(day.date)}</span>
                  </div>
                ))}
              </div>
              {availabilityEmployees.map((employee) => {
                const canEdit =
                  currentUser.role === "EMPLOYEE" && employee.userId === currentUser.id;
                return (
                  <div
                    className="availability-grid availability-row"
                    key={employee.id}
                    style={employeeColorStyle(employee)}
                  >
                    <div className="availability-employee">
                      <strong className="employee-name-with-color">
                        <i className="employee-color-dot" aria-hidden="true" />
                        {employee.name}
                      </strong>
                      <span>{canEdit ? "האילוצים שלי" : employee.roleTitle}</span>
                    </div>
                    {days.map((day) => {
                      const timeOff = findTimeOff(
                        schedule.availabilityBlocks,
                        employee.id,
                        day.index
                      );
                      return (
                        <div className={`availability-day ${timeOff ? "is-time-off" : ""}`} key={day.index}>
                          <button
                            type="button"
                            className={`time-off-toggle ${timeOff ? "active" : ""}`}
                            aria-pressed={Boolean(timeOff)}
                            disabled={!canEdit}
                            onClick={() => toggleTimeOff(employee.id, day.index)}
                          >
                            Time Off
                          </button>
                          {getShiftTypes().map((shiftType) => {
                            const availability = findShiftAvailability(
                              schedule.availabilityBlocks,
                              employee.id,
                              day.index,
                              shiftType
                            );
                            const value = availability?.status ?? "AVAILABLE";
                            return (
                              <label className={`availability-choice ${value.toLowerCase()}`} key={shiftType}>
                                <span>{SHIFT_DEFINITIONS[shiftType].label}</span>
                                <select
                                  aria-label={`${employee.name}, ${day.label}, ${SHIFT_DEFINITIONS[shiftType].label}`}
                                  value={value}
                                  disabled={!canEdit || Boolean(timeOff)}
                                  onChange={(event) =>
                                    setShiftAvailability(
                                      employee.id,
                                      day.index,
                                      shiftType,
                                      event.target.value as AvailabilityStatus | "AVAILABLE"
                                    )
                                  }
                                >
                                  <option value="AVAILABLE">פנוי</option>
                                  <option value="PREFERRED">מעוניין</option>
                                  <option value="UNAVAILABLE">לא זמין</option>
                                </select>
                              </label>
                            );
                          })}
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </section>

          <footer className="bottom-summary">
            <div>
              <Clock3 size={18} />
              {schedule.summaries.reduce((sum, item) => sum + item.workHours, 0)} שעות
            </div>
            <div>
              <CalendarDays size={18} />
              {schedule.assignments.length} משמרות
            </div>
            <div>
              <UsersRound size={18} />
              {schedule.employees.length} עובדים
            </div>
            <div>
              <MessageSquare size={18} />
              {schedule.swaps.length} החלפות
            </div>
          </footer>
        </main>
      </div>

      {toast ? (
        <button className="toast" onClick={() => setToast("")}>
          {toast}
        </button>
      ) : null}
      {pendingAssignment ? (
        <div className="modal-backdrop" role="presentation">
          <section className="warning-dialog" role="dialog" aria-modal="true" aria-labelledby="warning-title">
            <div className="warning-dialog-icon"><AlertTriangle size={22} /></div>
            <div>
              <h2 id="warning-title">נדרש אישור חריגה</h2>
              <ul>
                {pendingAssignment.warnings.map((warning) => <li key={warning}>{warning}</li>)}
              </ul>
            </div>
            <div className="warning-dialog-actions">
              <button className="soft-action" onClick={() => setPendingAssignment(null)}>ביטול</button>
              <button
                className="warning-action"
                onClick={() =>
                  assignShift(pendingAssignment.dayIndex, pendingAssignment.shiftType, true)
                }
              >
                שיבוץ בכל זאת
              </button>
            </div>
          </section>
        </div>
      ) : null}
      {isLoading ? <div className="loading-bar" /> : null}
    </div>
  );
}

function groupAssignments(assignments: ShiftAssignment[]) {
  const groups = new Map<string, ShiftAssignment[]>();
  for (const assignment of assignments) {
    const key = cellKey(assignment.dayIndex, assignment.shiftType);
    groups.set(key, [...(groups.get(key) ?? []), assignment]);
  }
  return groups;
}

function cellKey(dayIndex: number, shiftType: ShiftType) {
  return `${dayIndex}-${shiftType}`;
}

function findShiftAvailability(
  blocks: AvailabilityBlock[],
  employeeId: string,
  dayIndex: number,
  shiftType: ShiftType
) {
  return blocks.find(
    (block) =>
      block.employeeId === employeeId &&
      block.dayIndex === dayIndex &&
      block.shiftType === shiftType
  );
}

function findTimeOff(blocks: AvailabilityBlock[], employeeId: string, dayIndex: number) {
  return blocks.find(
    (block) =>
      block.employeeId === employeeId &&
      block.dayIndex === dayIndex &&
      block.status === "TIME_OFF"
  );
}

function isUnavailableForShift(
  blocks: AvailabilityBlock[],
  employeeId: string,
  dayIndex: number,
  shiftType: ShiftType
) {
  if (findTimeOff(blocks, employeeId, dayIndex)) {
    return true;
  }
  return findShiftAvailability(blocks, employeeId, dayIndex, shiftType)?.status === "UNAVAILABLE";
}

function availabilityStatusLabel(status: AvailabilityStatus | "AVAILABLE") {
  const labels = {
    AVAILABLE: "פנוי",
    UNAVAILABLE: "לא זמין",
    PREFERRED: "מעוניין לעבוד",
    TIME_OFF: "Time Off"
  };
  return labels[status];
}

function employeeColorStyle(employee: Employee | undefined): CSSProperties {
  const color = getEmployeeColor(employee?.userId ?? employee?.id ?? "unassigned");
  return {
    "--employee-color": color.solid,
    "--employee-soft": color.soft
  } as CSSProperties;
}

function swapStatusLabel(status: ShiftSwapRequest["status"]) {
  const labels = {
    PENDING_EMPLOYEE: "ממתין לאישור עובד",
    DECLINED_BY_EMPLOYEE: "נדחה על ידי עובד",
    PENDING_MANAGER: "ממתין לאישור מנהלת",
    DECLINED_BY_MANAGER: "נדחה על ידי מנהלת",
    APPROVED: "אושר"
  };
  return labels[status];
}
