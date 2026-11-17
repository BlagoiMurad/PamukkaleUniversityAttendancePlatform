process.env.NODE_ENV = process.env.NODE_ENV || 'test';
process.env.JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET || 'test-secret-test-secret-test-secret-123';
process.env.DATABASE_URL =
  process.env.TEST_DATABASE_URL ||
  'postgresql://attendance:attendance@localhost:5432/attendance_test?schema=public';
process.env.PUBLIC_WEB_URL = process.env.PUBLIC_WEB_URL || 'https://attendance.test';
