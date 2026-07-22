"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { Employee } from "@/lib/types";

export function useAvailabilityView({
  employees,
  visibleEmployeeIds,
  pageSize,
  resetKey
}: {
  employees: Employee[];
  visibleEmployeeIds: Set<string>;
  pageSize: number;
  resetKey: string;
}) {
  // A null selection means all current employees, including employees added after initialization.
  const [selectedEmployeeIds, setSelectedEmployeeIds] = useState<string[] | null>(null);
  const [page, setPage] = useState(1);

  const selection = useMemo(() => {
    const currentIds = new Set(employees.map((employee) => employee.id));
    return new Set(
      (selectedEmployeeIds ?? [...currentIds]).filter((employeeId) => currentIds.has(employeeId))
    );
  }, [employees, selectedEmployeeIds]);

  const selectedEmployees = useMemo(
    () =>
      employees.filter(
        (employee) => selection.has(employee.id) && visibleEmployeeIds.has(employee.id)
      ),
    [employees, selection, visibleEmployeeIds]
  );
  const pageCount = Math.max(1, Math.ceil(selectedEmployees.length / pageSize));
  const safePage = Math.min(page, pageCount);
  const visibleEmployees = useMemo(
    () => selectedEmployees.slice((safePage - 1) * pageSize, safePage * pageSize),
    [pageSize, safePage, selectedEmployees]
  );

  useEffect(() => {
    setPage(1);
  }, [resetKey, selectedEmployeeIds]);

  const toggleEmployee = useCallback((employeeId: string) => {
    setSelectedEmployeeIds((current) => {
      const selected = new Set(current ?? employees.map((employee) => employee.id));
      if (selected.has(employeeId)) {
        selected.delete(employeeId);
      } else {
        selected.add(employeeId);
      }
      return selected.size === employees.length ? null : [...selected];
    });
  }, [employees]);

  const toggleAll = useCallback((selected: boolean) => {
    setSelectedEmployeeIds(selected ? null : []);
  }, []);

  const previousPage = useCallback(() => setPage((current) => Math.max(1, current - 1)), []);
  const nextPage = useCallback(
    () => setPage((current) => Math.min(pageCount, current + 1)),
    [pageCount]
  );

  return {
    selection,
    selectedEmployees,
    visibleEmployees,
    page: safePage,
    pageCount,
    previousPage,
    nextPage,
    toggleEmployee,
    toggleAll
  };
}
