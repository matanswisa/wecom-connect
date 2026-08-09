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
  Pencil,
  Plus,
  Repeat2,
  Search,
  Share2,
  ShieldAlert,
  Trash2,
  UserRound,
  UserPlus,
  UsersRound,
  X
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { AvailabilityPanel } from "./AvailabilityPanel";
import { AssignmentUndoToast } from "./AssignmentUndoToast";
import { EmployeeEditorDialog, type EmployeeEditor } from "./EmployeeEditorDialog";
import { ShiftWorkerPicker } from "./ShiftWorkerPicker";
import { ThemeToggle } from "./ThemeToggle";
import {
  availabilityStatusLabel,
  findShiftAvailability,
  findTimeOff,
  getAssignmentAvailabilityHint,
  isUnavailableForShift
} from "@/lib/availability";
import { addDays, formatHebrewDate, getScheduleDays } from "@/lib/dates";
import { getEmployeeColor } from "@/lib/employeeColors";
import { createSchedulePdf, schedulePdfFilename, shareOrDownloadPdf } from "@/lib/schedulePdf";
import { buildScheduleCsv, scheduleExportFilename } from "@/lib/scheduleExport";
import { SHIFT_DEFINITIONS, getShiftTypes } from "@/lib/shifts";
import { useAvailabilityView } from "@/hooks/useAvailabilityView";
import { useUndoableAction } from "@/hooks/useUndoableAction";
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
  availabilityWeekStart: string;
  employees: Employee[];
  assignments: ShiftAssignment[];
  scheduleAvailabilityBlocks: AvailabilityBlock[];
  availabilityBlocks: AvailabilityBlock[];
  swaps: ShiftSwapRequest[];
  summaries: EmployeeSummary[];
}

interface PendingAssignment {
  employeeId: string;
  dayIndex: number;
  shiftType: ShiftType;
  warnings: string[];
}

interface AssignmentPicker {
  cellKey: string;
  employeeId: string;
}

type NavigationSection = "schedule" | "employees" | "notifications" | "swaps";

const EMPTY_SCHEDULE: SchedulePayload = {
  weekStart: "",
  availabilityWeekStart: "",
  employees: [],
  assignments: [],
  scheduleAvailabilityBlocks: [],
  availabilityBlocks: [],
  swaps: [],
  summaries: []
};

const AVAILABILITY_PAGE_SIZE = 5;
const ASSIGNMENT_UNDO_DURATION_MS = 6000;

export function ScheduleDashboard({
  currentUser,
  initialWeekStart,
  initialAvailabilityWeekStart
}: {
  currentUser: User;
  initialWeekStart: string;
  initialAvailabilityWeekStart: string;
}) {
  const [weekStart, setWeekStart] = useState(initialWeekStart);
  const [schedule, setSchedule] = useState<SchedulePayload>(EMPTY_SCHEDULE);
  const [assignmentPicker, setAssignmentPicker] = useState<AssignmentPicker | null>(null);
  const [pendingAssignment, setPendingAssignment] = useState<PendingAssignment | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeSection, setActiveSection] = useState<NavigationSection>("schedule");
  const [isAvailabilityFilterOpen, setIsAvailabilityFilterOpen] = useState(false);
  const [employeeEditor, setEmployeeEditor] = useState<EmployeeEditor | null>(null);
  const [employeeToDelete, setEmployeeToDelete] = useState<Employee | null>(null);
  const [toast, setToast] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSavingEmployee, setIsSavingEmployee] = useState(false);
  const [isExportingPdf, setIsExportingPdf] = useState(false);
  const scheduleTableRef = useRef<HTMLDivElement>(null);
  const pendingAssignmentRemovalsRef = useRef(new Map<string, ShiftAssignment>());

  const days = useMemo(() => getScheduleDays(weekStart), [weekStart]);
  const availabilityDays = useMemo(
    () => getScheduleDays(initialAvailabilityWeekStart),
    [initialAvailabilityWeekStart]
  );
  const assignmentsByCell = useMemo(() => groupAssignments(schedule.assignments), [schedule.assignments]);
  const employeesById = useMemo(
    () => new Map(schedule.employees.map((employee) => [employee.id, employee])),
    [schedule.employees]
  );
  const ownEmployee = useMemo(
    () => schedule.employees.find((employee) => employee.userId === currentUser.id),
    [currentUser.id, schedule.employees]
  );
  const selectableEmployees = useMemo(
    () =>
      currentUser.role === "MANAGER"
        ? schedule.employees
        : schedule.employees.filter((employee) => employee.userId === currentUser.id),
    [currentUser.id, currentUser.role, schedule.employees]
  );
  const matchingEmployeeIds = useMemo(() => {
    const query = searchQuery.trim().toLocaleLowerCase("he");
    return new Set(
      schedule.employees
        .filter((employee) =>
          !query || [employee.name, employee.email, employee.roleTitle]
            .some((value) => value.toLocaleLowerCase("he").includes(query))
        )
        .map((employee) => employee.id)
    );
  }, [schedule.employees, searchQuery]);
  const availabilityCandidates = useMemo(
    () => currentUser.role === "MANAGER" ? schedule.employees : selectableEmployees,
    [currentUser.role, schedule.employees, selectableEmployees]
  );
  const availabilityVisibleIds = useMemo(
    () =>
      currentUser.role === "MANAGER"
        ? matchingEmployeeIds
        : new Set(selectableEmployees.map((employee) => employee.id)),
    [currentUser.role, matchingEmployeeIds, selectableEmployees]
  );
  const availabilityView = useAvailabilityView({
    employees: availabilityCandidates,
    visibleEmployeeIds: availabilityVisibleIds,
    pageSize: AVAILABILITY_PAGE_SIZE,
    resetKey: `${initialAvailabilityWeekStart}:${searchQuery}`
  });
  const openAvailabilityFilter = useCallback(() => setIsAvailabilityFilterOpen(true), []);
  const closeAvailabilityFilter = useCallback(() => setIsAvailabilityFilterOpen(false), []);
  const swapSourceAssignments = useMemo(
    () =>
      currentUser.role === "MANAGER"
        ? schedule.assignments
        : schedule.assignments.filter((assignment) => assignment.employeeId === ownEmployee?.id),
    [currentUser.role, ownEmployee?.id, schedule.assignments]
  );

  const loadSchedule = useCallback(async (nextWeekStart = weekStart) => {
    setIsLoading(true);
    const response = await fetch(
      `/api/schedule?weekStart=${nextWeekStart}&availabilityWeekStart=${initialAvailabilityWeekStart}`
    );
    if (response.ok) {
      const payload = (await response.json()) as SchedulePayload;
      setSchedule(hidePendingAssignmentRemovals(payload, pendingAssignmentRemovalsRef.current));
    }
    setIsLoading(false);
  }, [initialAvailabilityWeekStart, weekStart]);

  const restoreAssignment = useCallback((assignment: ShiftAssignment) => {
    pendingAssignmentRemovalsRef.current.delete(assignment.id);
    setSchedule((current) => restoreAssignmentInSchedule(current, assignment));
  }, []);

  const commitAssignmentRemoval = useCallback(async (assignment: ShiftAssignment) => {
    const response = await fetch(`/api/assignments/${assignment.id}`, { method: "DELETE" });
    if (!response.ok) {
      restoreAssignment(assignment);
      setToast("מחיקת השיבוץ נכשלה והשיבוץ הוחזר.");
      return;
    }
    pendingAssignmentRemovalsRef.current.delete(assignment.id);
    setToast("השיבוץ נמחק.");
  }, [restoreAssignment]);

  const assignmentRemoval = useUndoableAction({
    durationMs: ASSIGNMENT_UNDO_DURATION_MS,
    onExpire: commitAssignmentRemoval,
    onUndo: restoreAssignment
  });

  useEffect(() => {
    void loadSchedule(weekStart);
  }, [weekStart, loadSchedule]);

  async function assignShift(
    employeeId: string,
    dayIndex: number,
    shiftType: ShiftType,
    acknowledgeWarnings = false
  ) {
    const response = await fetch("/api/assignments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        employeeId,
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
        setPendingAssignment({ employeeId, dayIndex, shiftType, warnings });
        return;
      }
      setToast(body.details?.errors?.[0]?.message ?? body.error ?? "השיבוץ נכשל.");
      return;
    }

    setPendingAssignment(null);
    setToast(acknowledgeWarnings ? "השיבוץ נשמר לאחר אישור האזהרה." : "השיבוץ נשמר.");
    await loadSchedule();
  }

  function stageAssignmentRemoval(assignment: ShiftAssignment) {
    if (assignmentRemoval.pending) {
      return;
    }
    pendingAssignmentRemovalsRef.current.set(assignment.id, assignment);
    setSchedule((current) => removeAssignmentFromSchedule(current, assignment));
    assignmentRemoval.stage(assignment);
  }

  const setShiftAvailability = useCallback(async function setShiftAvailability(
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
            weekStart: initialAvailabilityWeekStart,
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
  }, [initialAvailabilityWeekStart, loadSchedule, schedule.availabilityBlocks]);

  const toggleTimeOff = useCallback(async function toggleTimeOff(
    employeeId: string,
    dayIndex: number
  ) {
    const existing = findTimeOff(schedule.availabilityBlocks, employeeId, dayIndex);
    const response = existing
      ? await fetch(`/api/availability/${existing.id}`, { method: "DELETE" })
      : await fetch("/api/availability", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            employeeId,
            weekStart: initialAvailabilityWeekStart,
            dayIndex,
            status: "TIME_OFF",
            reason: "חופש"
          })
        });

    setToast(response.ok ? (existing ? "החופשה הוסרה." : "החופשה נשמרה.") : "עדכון החופשה נכשל.");
    if (response.ok) {
      await loadSchedule();
    }
  }, [initialAvailabilityWeekStart, loadSchedule, schedule.availabilityBlocks]);

  async function createSwap(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const response = await fetch("/api/swaps", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(Object.fromEntries(formData.entries()))
    });

    const body = await response.json();
    setToast(response.ok ? "בקשת ההחלפה נשלחה." : body.error ?? "בקשת ההחלפה נכשלה.");
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
    const body = await response.json();
    setToast(response.ok ? "סטטוס ההחלפה עודכן." : body.error ?? "עדכון ההחלפה נכשל.");
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

  async function exportSchedulePdf() {
    if (!scheduleTableRef.current || isExportingPdf) {
      return;
    }
    setIsExportingPdf(true);
    setToast("מכין קובץ PDF...");
    try {
      const blob = await createSchedulePdf(scheduleTableRef.current);
      const result = await shareOrDownloadPdf(blob, schedulePdfFilename(weekStart));
      setToast(
        result === "shared"
          ? "קובץ ה-PDF שותף בהצלחה."
          : result === "cancelled"
            ? "השיתוף בוטל."
            : "קובץ ה-PDF הורד בהצלחה."
      );
    } catch (error) {
      console.error(error);
      setToast("יצירת קובץ ה-PDF נכשלה.");
    } finally {
      setIsExportingPdf(false);
    }
  }

  async function saveEmployee(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!employeeEditor) {
      return;
    }
    setIsSavingEmployee(true);
    const payload = Object.fromEntries(new FormData(event.currentTarget).entries());
    const isCreate = employeeEditor.mode === "create";
    const response = await fetch(
      isCreate ? "/api/employees" : `/api/employees/${employeeEditor.employee.id}`,
      {
        method: isCreate ? "POST" : "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      }
    );
    const body = await response.json();
    setIsSavingEmployee(false);
    if (!response.ok) {
      setToast(body.error ?? "שמירת העובד נכשלה.");
      return;
    }
    setEmployeeEditor(null);
    setToast(isCreate ? "העובד נוסף למערכת." : "פרטי העובד עודכנו.");
    await loadSchedule();
  }

  async function deleteEmployee() {
    if (!employeeToDelete) {
      return;
    }
    const response = await fetch(`/api/employees/${employeeToDelete.id}`, { method: "DELETE" });
    const body = await response.json();
    if (!response.ok) {
      setToast(body.error ?? "מחיקת העובד נכשלה.");
      return;
    }
    setEmployeeToDelete(null);
    setToast("העובד נמחק מהמערכת.");
    await loadSchedule();
  }

  function navigateTo(section: NavigationSection, elementId: string) {
    setActiveSection(section);
    document.getElementById(elementId)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function showNotifications() {
    setActiveSection("notifications");
    const pending = schedule.swaps.filter((swap) =>
      swap.status === "PENDING_EMPLOYEE" || swap.status === "PENDING_MANAGER"
    ).length;
    setToast(pending > 0 ? `${pending} בקשות החלפה ממתינות לאישור.` : "אין התראות חדשות.");
  }

  return (
    <div className="app-frame">
      <aside className="icon-rail" aria-label="ניווט">
        <div className="rail-logo">
          <Image src="/wecom-logo.svg" alt="wecom" width={92} height={42} priority />
        </div>
        <button
          title="לוח משמרות"
          className={`rail-button ${activeSection === "schedule" ? "active" : ""}`}
          onClick={() => navigateTo("schedule", "schedule-section")}
        >
          <CalendarDays size={20} />
        </button>
        <button
          title="עובדים"
          className={`rail-button ${activeSection === "employees" ? "active" : ""}`}
          onClick={() => navigateTo("employees", "employees-section")}
        >
          <UsersRound size={20} />
        </button>
        <button
          title="התראות"
          className={`rail-button ${activeSection === "notifications" ? "active" : ""}`}
          onClick={showNotifications}
        >
          <Bell size={20} />
        </button>
        <button
          title="החלפות"
          className={`rail-button ${activeSection === "swaps" ? "active" : ""}`}
          onClick={() => navigateTo("swaps", "swaps-section")}
        >
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
            <input
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="חיפוש עובד"
              aria-label="חיפוש עובד"
            />
            {searchQuery ? (
              <button className="search-clear" onClick={() => setSearchQuery("")} title="נקה חיפוש">
                <X size={15} />
              </button>
            ) : null}
          </div>
          <div className="topbar-actions">
            <span className="trial-pill">ניהול משמרות</span>
            <span className="user-pill">
              <UserRound size={18} />
              {currentUser.name}
            </span>
            <ThemeToggle />
            <button className="icon-button" onClick={logout} title="יציאה">
              <LogOut size={18} />
            </button>
          </div>
        </header>

        <main className="scheduler-page">
          <section className="schedule-toolbar" id="schedule-section">
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
              <button
                className="export-button"
                onClick={exportSchedulePdf}
                disabled={isExportingPdf}
              >
                <Share2 size={17} />
                {isExportingPdf ? "מכין PDF..." : "PDF / שיתוף"}
              </button>
            </div>
          </section>

          <section className="main-grid">
            <div
              className="schedule-panel"
              ref={scheduleTableRef}
              data-pdf-target="schedule"
            >
              <div className="schedule-pdf-header pdf-only">
                <Image src="/wecom-logo.svg" alt="wecom" width={96} height={44} />
                <div>
                  <strong>סידור עבודה שבועי</strong>
                  <span>{formatHebrewDate(weekStart)} - {formatHebrewDate(addDays(weekStart, 6))}</span>
                </div>
              </div>
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
                        {currentUser.role === "MANAGER" ? (
                          assignmentPicker?.cellKey === key ? (
                            <ShiftWorkerPicker
                              employees={schedule.employees}
                              selectedEmployeeId={assignmentPicker.employeeId}
                              shiftLabel={`${day.label}, ${SHIFT_DEFINITIONS[shiftType].label}`}
                              assignedEmployeeIds={new Set(
                                assignments.map((assignment) => assignment.employeeId)
                              )}
                              getAvailabilityHint={(employeeId) =>
                                getAssignmentAvailabilityHint(
                                  schedule.scheduleAvailabilityBlocks,
                                  employeeId,
                                  day.index,
                                  shiftType
                                )
                              }
                              onSelect={(employeeId) =>
                                setAssignmentPicker({ cellKey: key, employeeId })
                              }
                              onSave={() => {
                                const employeeId = assignmentPicker.employeeId;
                                setAssignmentPicker(null);
                                void assignShift(employeeId, day.index, shiftType);
                              }}
                              onClose={() => setAssignmentPicker(null)}
                            />
                          ) : (
                            <button
                              className="add-shift"
                              data-pdf-hide="true"
                              onClick={() => setAssignmentPicker({ cellKey: key, employeeId: "" })}
                            >
                              <Plus size={16} />
                              שיבוץ
                            </button>
                          )
                        ) : (
                          <div className="employee-shift-state" data-pdf-hide="true">שיבוץ מנהלת</div>
                        )}
                        <div className="assigned-list">
                          {assignments
                            .filter((assignment) => matchingEmployeeIds.has(assignment.employeeId))
                            .map((assignment) => {
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
                                  schedule.scheduleAvailabilityBlocks,
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
                                  data-pdf-hide="true"
                                  disabled={Boolean(assignmentRemoval.pending)}
                                  onClick={() => stageAssignmentRemoval(assignment)}
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
              <section className="summary-block" id="employees-section">
                <div className="panel-title-row">
                  <div className="panel-title">
                    <UsersRound size={18} />
                    <h2>סיכום עובדים</h2>
                  </div>
                  {currentUser.role === "MANAGER" ? (
                    <button
                      type="button"
                      className="employee-add-button"
                      title="הוספת עובד"
                      onClick={() => setEmployeeEditor({ mode: "create", employee: null })}
                    >
                      <UserPlus size={17} />
                      הוספה
                    </button>
                  ) : null}
                </div>
                <div className="summary-list">
                  {schedule.summaries
                    .filter((summary) => matchingEmployeeIds.has(summary.employeeId))
                    .map((summary) => {
                    const employee = employeesById.get(summary.employeeId);
                    return (
                      <div
                        className="summary-item"
                        key={summary.employeeId}
                        style={employeeColorStyle(employee)}
                      >
                        <div className="summary-copy">
                          <strong className="employee-name-with-color">
                            <i className="employee-color-dot" aria-hidden="true" />
                            {employee?.name}
                          </strong>
                          <span>
                            {summary.shiftCount}/{summary.maxShifts} משמרות
                          </span>
                        </div>
                        <div className="summary-meta">
                          <b>{summary.workHours} שעות</b>
                          {currentUser.role === "MANAGER" && employee ? (
                            <div className="summary-controls">
                              <button
                                type="button"
                                title={`עריכת ${employee.name}`}
                                onClick={() => setEmployeeEditor({ mode: "edit", employee })}
                              >
                                <Pencil size={15} />
                              </button>
                              <button
                                type="button"
                                className="delete"
                                title={`מחיקת ${employee.name}`}
                                onClick={() => setEmployeeToDelete(employee)}
                              >
                                <Trash2 size={15} />
                              </button>
                            </div>
                          ) : null}
                        </div>
                      </div>
                    );
                  })}
                  {matchingEmployeeIds.size === 0 ? <p className="empty-state">לא נמצאו עובדים.</p> : null}
                </div>
              </section>

              <section className="summary-block" id="swaps-section">
                <div className="panel-title">
                  <Repeat2 size={18} />
                  <h2>החלפות</h2>
                </div>
                <form className="compact-form" onSubmit={createSwap}>
                  <select name="requesterAssignmentId" required defaultValue="">
                    <option value="" disabled>
                      משמרת מקור
                    </option>
                    {swapSourceAssignments.map((assignment) => (
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
                  <button className="primary-button" disabled={swapSourceAssignments.length === 0}>
                    {swapSourceAssignments.length === 0 ? "אין משמרת להחלפה" : "שלח החלפה"}
                  </button>
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

          <AvailabilityPanel
            currentUser={currentUser}
            weekStart={initialAvailabilityWeekStart}
            days={availabilityDays}
            employees={availabilityCandidates}
            visibleEmployees={availabilityView.visibleEmployees}
            selectedEmployeeIds={availabilityView.selection}
            selectedEmployeeCount={availabilityView.selectedEmployees.length}
            page={availabilityView.page}
            pageCount={availabilityView.pageCount}
            pageSize={AVAILABILITY_PAGE_SIZE}
            availabilityBlocks={schedule.availabilityBlocks}
            isFilterOpen={isAvailabilityFilterOpen}
            onOpenFilter={openAvailabilityFilter}
            onCloseFilter={closeAvailabilityFilter}
            onToggleEmployee={availabilityView.toggleEmployee}
            onToggleAll={availabilityView.toggleAll}
            onPreviousPage={availabilityView.previousPage}
            onNextPage={availabilityView.nextPage}
            onSetShiftAvailability={setShiftAvailability}
            onToggleTimeOff={toggleTimeOff}
          />

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
      {assignmentRemoval.pending ? (
        <AssignmentUndoToast
          employeeName={employeesById.get(assignmentRemoval.pending.employeeId)?.name ?? "העובד"}
          secondsLeft={assignmentRemoval.secondsLeft}
          durationMs={ASSIGNMENT_UNDO_DURATION_MS}
          onUndo={assignmentRemoval.undo}
        />
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
                  assignShift(
                    pendingAssignment.employeeId,
                    pendingAssignment.dayIndex,
                    pendingAssignment.shiftType,
                    true
                  )
                }
              >
                שיבוץ בכל זאת
              </button>
            </div>
          </section>
        </div>
      ) : null}
      {employeeEditor ? (
        <EmployeeEditorDialog
          key={`${employeeEditor.mode}-${employeeEditor.employee?.id ?? "new"}`}
          editor={employeeEditor}
          isSaving={isSavingEmployee}
          onClose={() => setEmployeeEditor(null)}
          onSubmit={saveEmployee}
        />
      ) : null}
      {employeeToDelete ? (
        <div className="modal-backdrop" role="presentation">
          <section className="warning-dialog" role="dialog" aria-modal="true" aria-labelledby="delete-title">
            <div className="warning-dialog-icon delete-dialog-icon"><Trash2 size={21} /></div>
            <div>
              <h2 id="delete-title">מחיקת {employeeToDelete.name}</h2>
              <p className="dialog-copy">
                המחיקה תסיר גם את השיבוצים, האילוצים ובקשות ההחלפה המשויכים לעובד.
              </p>
            </div>
            <div className="warning-dialog-actions">
              <button className="soft-action" onClick={() => setEmployeeToDelete(null)}>ביטול</button>
              <button className="delete-action" onClick={deleteEmployee}>מחיקת עובד</button>
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

function removeAssignmentFromSchedule(
  schedule: SchedulePayload,
  assignment: ShiftAssignment
): SchedulePayload {
  if (!schedule.assignments.some((item) => item.id === assignment.id)) {
    return schedule;
  }
  return {
    ...schedule,
    assignments: schedule.assignments.filter((item) => item.id !== assignment.id),
    summaries: adjustEmployeeSummary(schedule.summaries, assignment.employeeId, -1)
  };
}

function restoreAssignmentInSchedule(
  schedule: SchedulePayload,
  assignment: ShiftAssignment
): SchedulePayload {
  if (
    schedule.weekStart.slice(0, 10) !== assignment.weekStart.slice(0, 10) ||
    schedule.assignments.some((item) => item.id === assignment.id)
  ) {
    return schedule;
  }
  return {
    ...schedule,
    assignments: [...schedule.assignments, assignment],
    summaries: adjustEmployeeSummary(schedule.summaries, assignment.employeeId, 1)
  };
}

function hidePendingAssignmentRemovals(
  schedule: SchedulePayload,
  pendingRemovals: ReadonlyMap<string, ShiftAssignment>
) {
  return [...pendingRemovals.values()].reduce(removeAssignmentFromSchedule, schedule);
}

function adjustEmployeeSummary(
  summaries: EmployeeSummary[],
  employeeId: string,
  shiftDelta: number
) {
  return summaries.map((summary) =>
    summary.employeeId === employeeId
      ? {
          ...summary,
          shiftCount: Math.max(0, summary.shiftCount + shiftDelta),
          workHours: Math.max(0, summary.workHours + shiftDelta * 8)
        }
      : summary
  );
}

function cellKey(dayIndex: number, shiftType: ShiftType) {
  return `${dayIndex}-${shiftType}`;
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
