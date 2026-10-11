# Library API Design: Books

This is a REST API design for the `books` resource of a library. All paths start with `/api`, and all request and response bodies use JSON.

A book looks like this:

```json
{
  "id": 7,
  "title": "Things Fall Apart",
  "author": "Chinua Achebe",
  "year": 1958,
  "isbn": "9780385474542",
  "available": true
}
```

## Endpoints

### 1. List all books
- **Method:** `GET`
- **Path:** `/api/books`
- **Description:** Returns an array of every book in the library.
- **Request body:** none
- **Success status:** `200 OK`

### 2. Get one book
- **Method:** `GET`
- **Path:** `/api/books/{id}` (for example `/api/books/7`)
- **Description:** Returns the single book with the given id.
- **Request body:** none
- **Success status:** `200 OK`

### 3. Create a book
- **Method:** `POST`
- **Path:** `/api/books`
- **Description:** Adds a new book to the library and returns it with its new id.
- **Example request body:**
  ```json
  {
    "title": "Half of a Yellow Sun",
    "author": "Chimamanda Ngozi Adichie",
    "year": 2006,
    "isbn": "9781400095209"
  }
  ```
- **Success status:** `201 Created`

### 4. Update a book (full update)
- **Method:** `PUT`
- **Path:** `/api/books/{id}`
- **Description:** Replaces all the fields of an existing book.
- **Example request body:**
  ```json
  {
    "title": "Half of a Yellow Sun",
    "author": "Chimamanda Ngozi Adichie",
    "year": 2006,
    "isbn": "9781400095209",
    "available": false
  }
  ```
- **Success status:** `200 OK`

### 5. Delete a book
- **Method:** `DELETE`
- **Path:** `/api/books/{id}`
- **Description:** Removes the book with the given id from the library.
- **Request body:** none
- **Success status:** `204 No Content`

### 6. List books by an author
- **Method:** `GET`
- **Path:** `/api/books?author={name}` (for example `/api/books?author=Chinua%20Achebe`)
- **Description:** Returns only the books written by the given author, using a query parameter.
- **Request body:** none
- **Success status:** `200 OK` (an empty array `[]` if the author has no books)

### 7. Update part of a book (extra)
- **Method:** `PATCH`
- **Path:** `/api/books/{id}`
- **Description:** Changes only the fields that are sent, for example marking a book as borrowed.
- **Example request body:**
  ```json
  {
    "available": false
  }
  ```
- **Success status:** `200 OK`

## Error codes

### 400 Bad Request
The request is invalid, so the server cannot process it.
- **Example:** `POST /api/books` with a body that has no `title`, or with `"year": "last year"` instead of a number.
- **Example:** `GET /api/books/abc`, where the id is not a number.

### 404 Not Found
The book (or path) that was asked for does not exist.
- **Example:** `GET /api/books/9999` when no book has the id 9999.
- **Example:** `DELETE /api/books/9999` for a book that was already deleted.
