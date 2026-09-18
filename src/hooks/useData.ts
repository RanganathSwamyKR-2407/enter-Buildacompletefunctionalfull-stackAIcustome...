import { useQuery } from "@tanstack/react-query";
import { api, db } from "@/lib/api";

export const useCases = (limit = 200) =>
  useQuery({ queryKey: ["cases", limit], queryFn: () => db.cases({}, limit) });

export const useCustomers = () =>
  useQuery({ queryKey: ["customers"], queryFn: () => db.customers() });

export const useOrders = () =>
  useQuery({ queryKey: ["orders"], queryFn: () => db.orders() });

export const usePayments = () =>
  useQuery({ queryKey: ["payments"], queryFn: () => db.payments() });

export const useRefunds = () =>
  useQuery({ queryKey: ["refunds"], queryFn: () => db.refunds() });

export const usePolicies = () =>
  useQuery({ queryKey: ["policies"], queryFn: () => db.policies() });

export const useAgents = () =>
  useQuery({ queryKey: ["agents"], queryFn: () => db.agents() });

export const useAudit = (caseUuid?: string) =>
  useQuery({ queryKey: ["audit", caseUuid], queryFn: () => db.audit(caseUuid) });

export const useEscalations = () =>
  useQuery({ queryKey: ["escalations"], queryFn: () => db.escalations() });

export const useAnalytics = () =>
  useQuery({ queryKey: ["analytics"], queryFn: () => api.analytics() });

export const useIncidents = () =>
  useQuery({ queryKey: ["incidents"], queryFn: () => api.incidents() });
