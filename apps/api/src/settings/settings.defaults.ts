import { z } from 'zod';

/**
 * Product settings. Every open question from spec section 15 has a default here and is editable
 * by an admin at runtime (Admin → Settings). See docs/DECISIONS.md for the reasoning.
 */
export const settingsSchema = z.object({
  universityName: z.string().min(1).max(120),
  universityTimeZone: z.string().min(1), // IANA zone; storage is always UTC (spec 9, 22.3)
  // Q1 – identity provider
  authProvider: z.enum(['LOCAL']), // SSO/LDAP integration is a future adapter
  // Q2 – course creation
  teacherCanCreateCourses: z.boolean(),
  // Lateness (spec 4.3) – 600 s = 10:00 minutes, exactly 10:00 is PRESENT
  lateAfterMinutes: z.number().int().min(0).max(240),
  // Q3 – after this many minutes check-in closes and the student ends up ABSENT. null = open until the end.
  checkinCloseAfterMinutes: z.number().int().min(1).max(600).nullable(),
  // Transition tolerance for the previous marker slot (spec 16.1, max 2 s). 0 disables it.
  markerGraceMs: z.number().int().min(0).max(2000),
  challengeTtlSeconds: z.number().int().min(20).max(300),
  challengeMaxAttempts: z.number().int().min(1).max(100),
  // Q4 – corrections after LOCKED
  teacherCanEditAfterLock: z.boolean(),
  lockAfterHours: z.number().int().min(0).max(24 * 60), // 0 = never auto-lock
  teacherCorrectionsNeedApproval: z.boolean(),
  // Q5 – no camera / disability / no smartphone
  allowManualCheckinRequests: z.boolean(),
  // Q6 – device policy
  studentSingleSession: z.boolean(),
  teacherMaxSessions: z.number().int().min(0).max(50), // 0 = unlimited (laptop + projector + phone)
  // Lifecycle
  autoEndAfterScheduledMinutes: z.number().int().min(0).max(600), // 0 = never auto-end
  // Q7 – retention (days). null = keep forever
  attendanceRetentionDays: z.number().int().min(30).nullable(),
  auditRetentionDays: z.number().int().min(30).nullable(),
  requestRetentionDays: z.number().int().min(30).nullable(),
  technicalRetentionDays: z.number().int().min(1).max(365),
  // Onboarding (spec 4.1)
  onboardingMode: z.enum(['ACTIVATION_LINK', 'TEMP_PASSWORD']),
  activationTtlHours: z.number().int().min(1).max(24 * 14),
  // Reports (spec 22.2/22.3)
  lateCountsAsPresent: z.boolean(),
  excusedCountsInDenominator: z.boolean(),
  // Student self-service (spec 18.3)
  studentEditableFields: z.array(z.enum(['preferredName', 'phone', 'locale'])),
  // Security (spec 10)
  mfaRequiredForStaff: z.boolean(),
});

export type Settings = z.infer<typeof settingsSchema>;

export const DEFAULT_SETTINGS: Settings = {
  universityName: 'Pamukkale University',
  universityTimeZone: 'Europe/Istanbul',
  authProvider: 'LOCAL',
  teacherCanCreateCourses: true,
  lateAfterMinutes: 10,
  checkinCloseAfterMinutes: null,
  markerGraceMs: 2000,
  challengeTtlSeconds: 60,
  challengeMaxAttempts: 20,
  teacherCanEditAfterLock: false,
  lockAfterHours: 72,
  teacherCorrectionsNeedApproval: false,
  allowManualCheckinRequests: true,
  studentSingleSession: true,
  teacherMaxSessions: 0,
  autoEndAfterScheduledMinutes: 15,
  attendanceRetentionDays: 1825,
  auditRetentionDays: 1825,
  requestRetentionDays: 1825,
  technicalRetentionDays: 30,
  onboardingMode: 'ACTIVATION_LINK',
  activationTtlHours: 72,
  lateCountsAsPresent: true,
  excusedCountsInDenominator: false,
  studentEditableFields: ['preferredName', 'phone', 'locale'],
  mfaRequiredForStaff: false,
};

/** Settings that are safe to expose to any signed-in user. */
export const PUBLIC_SETTING_KEYS = [
  'universityName',
  'universityTimeZone',
  'lateAfterMinutes',
  'checkinCloseAfterMinutes',
  'allowManualCheckinRequests',
  'teacherCanCreateCourses',
  'studentEditableFields',
  'onboardingMode',
] as const satisfies readonly (keyof Settings)[];
