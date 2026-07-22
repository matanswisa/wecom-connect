"use client";

import Image from "next/image";
import {
  Bell,
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock3,
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
import { useCallback, useEffect, useMemo, useState } from "react";
import { addDays, formatHebrewDate, getScheduleDays } from "@/lib/dates";
import { SHIFT_DEFINITIONS, getShiftTypes } from "@/lib/shifts";
import type {
  AvailabilityBlock,
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
  const [toast, setToast] = useState("");
  const [isLoading, setIsLoading] = useState(true);

  const days = useMemo(() => getScheduleDays(weekStart), [weekStart]);
  const assignmentsByCell = useMemo(() => groupAssignments(schedule.assignments), [schedule.assignments]);
  const employeesById = useMemo(
    () => new Map(schedule.employees.map((employee) => [employee.id, employee])),
    [schedule.employees]
  );

  const loadSchedule = useCallback(async (nextWeekStart = weekStart) => {
    setIsLoading(true);
    const response = await fetch(`/api/schedule?weekStart=${nextWeekStart}`);
    if (response.ok) {
      const payload = (await response.json()) as SchedulePayload;
      setSchedule(payload);
      setSelectedEmployeeId((current) => current || payload.employees[0]?.id || "");
    }
    setIsLoading(false);
  }, [weekStart]);

  useEffect(() => {
    void loadSchedule(weekStart);
  }, [weekStart, loadSchedule]);

  async function assignShift(dayIndex: number, shiftType: ShiftType) {
    if (!selectedEmployeeId) {
      setToast("צריך לבחור עובד לשיבוץ.");
      return;
    }

    const response = await fetch("/api/assignments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ employeeId: selectedEmployeeId, weekStart, dayIndex, shiftType })
    });
    const body = await response.json();

    if (!response.ok) {
      setToast(body.details?.errors?.[0]?.message ?? body.error ?? "השיבוץ נכשל.");
      return;
    }

    const warning = body.validation?.warnings?.[0]?.message;
    setToast(warning ?? "השיבוץ נשמר.");
    await loadSchedule();
  }

  async function removeAssignment(id: string) {
    await fetch(`/api/assignments/${id}`, { method: "DELETE" });
    await loadSchedule();
  }

  async function createBlock(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const response = await fetch("/api/availability", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(Object.fromEntries(formData.entries()))
    });

    setToast(response.ok ? "החסימה נשמרה." : "שמירת החסימה נכשלה.");
    if (response.ok) {
      event.currentTarget.reset();
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
                {formatHebrewDate(weekStart)} - {formatHebrewDate(addDays(weekStart, 4))}
              </div>
              <button className="soft-button" onClick={() => setWeekStart(addDays(weekStart, 7))}>
                <ChevronLeft size={18} />
              </button>
              <select
                value={selectedEmployeeId}
                onChange={(event) => setSelectedEmployeeId(event.target.value)}
              >
                {schedule.employees.map((employee) => (
                  <option value={employee.id} key={employee.id}>
                    {employee.name}
                  </option>
                ))}
              </select>
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
                    return (
                      <div className="shift-cell" key={key}>
                        <button
                          className="add-shift"
                          onClick={() => assignShift(day.index, shiftType)}
                          disabled={currentUser.role !== "MANAGER"}
                        >
                          <Plus size={16} />
                          שיבוץ
                        </button>
                        <div className="assigned-list">
                          {assignments.map((assignment) => (
                            <div className="employee-chip" key={assignment.id}>
                              <span>{employeesById.get(assignment.employeeId)?.name ?? "עובד"}</span>
                              {currentUser.role === "MANAGER" ? (
                                <button
                                  onClick={() => removeAssignment(assignment.id)}
                                  title="הסר שיבוץ"
                                >
                                  <X size={14} />
                                </button>
                              ) : null}
                            </div>
                          ))}
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
                      <div className="summary-item" key={summary.employeeId}>
                        <div>
                          <strong>{employee?.name}</strong>
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
                  <ShieldAlert size={18} />
                  <h2>חסימות</h2>
                </div>
                <form className="compact-form" onSubmit={createBlock}>
                  <select name="employeeId" required defaultValue="">
                    <option value="" disabled>
                      עובד
                    </option>
                    {schedule.employees.map((employee) => (
                      <option value={employee.id} key={employee.id}>
                        {employee.name}
                      </option>
                    ))}
                  </select>
                  <input type="hidden" name="weekStart" value={weekStart} />
                  <select name="dayIndex" required defaultValue="0">
                    {days.map((day) => (
                      <option value={day.index} key={day.index}>
                        {day.label}
                      </option>
                    ))}
                  </select>
                  <select name="shiftType" required defaultValue="MORNING">
                    {getShiftTypes().map((shiftType) => (
                      <option value={shiftType} key={shiftType}>
                        {SHIFT_DEFINITIONS[shiftType].label}
                      </option>
                    ))}
                  </select>
                  <input name="reason" placeholder="סיבה" />
                  <button className="primary-button">שמור חסימה</button>
                </form>
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
