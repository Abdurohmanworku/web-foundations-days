# School Database Design

## Tables

### students
Stores one row per student: an `id` (primary key), the student's `name` and their `email`. The email is `NOT NULL` and `UNIQUE`, so two students cannot share the same address.

### courses
Stores one row per course: an `id` (primary key), the course `title` and the number of `credits`. Both of the last two are required.

### enrolments
Stores the fact that a student is taking a course. Each row has an `id`, a `student_id` (foreign key to `students`), a `course_id` (foreign key to `courses`) and a `grade`. The grade can be `NULL` because it is empty until the work is marked. A `UNIQUE (student_id, course_id)` rule stops the same student enrolling on the same course twice.

## Relationships

- **students to enrolments is one-to-many.** One student can have many enrolments, but each enrolment belongs to exactly one student.
- **courses to enrolments is one-to-many.** One course can have many enrolments, but each enrolment belongs to exactly one course.
- **students to courses is many-to-many.** A student can take many courses, and a course can have many students. This is the relationship the system really cares about.

**Why a join table is needed:** a relational table cannot hold a list in one column. If `students` had a `course_id` column, a student could only be on one course. If we stored several course ids in one cell, we could not use foreign keys, joins or counts properly. The `enrolments` table solves this by turning the many-to-many relationship into two one-to-many relationships. It also gives a natural place to store data that belongs to the pair (the grade), which does not belong to either the student or the course alone.

## Index

I would add an index on `enrolments(course_id)`:

```sql
CREATE INDEX idx_enrolments_course_id ON enrolments(course_id);
```

**Reason:** queries such as "all students on one course" and "number of students per course" search the enrolments table by `course_id`. SQLite does not create an index on a foreign key automatically. The `UNIQUE (student_id, course_id)` rule already gives an index that helps searches by student, but not searches by course alone. With thousands of enrolments, the index lets the database jump to the matching rows instead of reading the whole table.

## SQL or NoSQL?

I would choose a SQL (relational) database for this system. The data is highly structured and full of relationships: students, courses and enrolments always have the same fields and refer to each other. SQL enforces that structure with primary keys, foreign keys, `NOT NULL` and `UNIQUE` rules, so we cannot enrol a student who does not exist or enrol the same student twice. Questions like "which students have no enrolments?" or "how many students are in each course?" are natural with joins and `GROUP BY`. A NoSQL document database would be easier to scale across many servers or to use when each record has a very different shape, but a school's data is small, consistent and needs accurate results, so those advantages matter less than correctness and clear relationships.
