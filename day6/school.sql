-- School database (SQLite)

PRAGMA foreign_keys = ON;

-- ---------- Tables ----------

CREATE TABLE students (
  id    INTEGER PRIMARY KEY AUTOINCREMENT,
  name  TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE
);

CREATE TABLE courses (
  id      INTEGER PRIMARY KEY AUTOINCREMENT,
  title   TEXT NOT NULL,
  credits INTEGER NOT NULL CHECK (credits > 0)
);

CREATE TABLE enrolments (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  student_id INTEGER NOT NULL,
  course_id  INTEGER NOT NULL,
  grade      INTEGER CHECK (grade BETWEEN 0 AND 100),  -- NULL until the work is graded
  FOREIGN KEY (student_id) REFERENCES students(id),
  FOREIGN KEY (course_id)  REFERENCES courses(id),
  UNIQUE (student_id, course_id)  -- the same student cannot join the same course twice
);

-- ---------- Sample data ----------

INSERT INTO students (name, email) VALUES
  ('Amara Bekele',  'amara@example.com'),
  ('Daniel Tesfaye', 'daniel@example.com'),
  ('Selam Haile',   'selam@example.com'),
  ('Yonas Girma',   'yonas@example.com');   -- not enrolled on anything yet

INSERT INTO courses (title, credits) VALUES
  ('Web Foundations', 4),
  ('Databases',       3),
  ('Mathematics',     5);

INSERT INTO enrolments (student_id, course_id, grade) VALUES
  (1, 1, 85),
  (1, 2, 78),
  (2, 1, 90),
  (2, 3, 66),
  (3, 1, 72),
  (3, 2, NULL);

-- ---------- Queries ----------

-- 1. All courses for one student (by name)
SELECT c.title, c.credits, e.grade
FROM students s
JOIN enrolments e ON e.student_id = s.id
JOIN courses c    ON c.id = e.course_id
WHERE s.name = 'Amara Bekele';

-- 2. All students on one course
SELECT s.name, s.email, e.grade
FROM courses c
JOIN enrolments e ON e.course_id = c.id
JOIN students s   ON s.id = e.student_id
WHERE c.title = 'Web Foundations';

-- 3. Number of students per course (LEFT JOIN so empty courses show 0)
SELECT c.title, COUNT(e.id) AS student_count
FROM courses c
LEFT JOIN enrolments e ON e.course_id = c.id
GROUP BY c.id, c.title;

-- 4. Students who have no enrolments
SELECT s.name, s.email
FROM students s
LEFT JOIN enrolments e ON e.student_id = s.id
WHERE e.id IS NULL;

-- 5. Update one enrolment's grade (Selam Haile on Databases)
UPDATE enrolments
SET grade = 88
WHERE student_id = (SELECT id FROM students WHERE name = 'Selam Haile')
  AND course_id  = (SELECT id FROM courses  WHERE title = 'Databases');

-- Check the update worked
SELECT s.name, c.title, e.grade
FROM enrolments e
JOIN students s ON s.id = e.student_id
JOIN courses c  ON c.id = e.course_id
WHERE s.name = 'Selam Haile';
