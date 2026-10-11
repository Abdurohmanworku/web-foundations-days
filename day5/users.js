// ---------- Select elements ----------
const loadButton = document.querySelector("#load-users");
const filterInput = document.querySelector("#filter-input");
const statusText = document.querySelector("#status");
const usersList = document.querySelector("#users-list");

const USERS_URL = "https://jsonplaceholder.typicode.com/users";

// All users that were loaded (the filter works on this array, no new request)
let allUsers = [];

// ---------- Draw any array of users ----------
function renderUsers(list) {
  usersList.replaceChildren();

  if (list.length === 0) {
    const li = document.createElement("li");
    li.textContent = "No users match your filter.";
    usersList.append(li);
    return;
  }

  list.forEach(function (user) {
    const li = document.createElement("li");

    const name = document.createElement("strong");
    name.textContent = user.name;

    const email = document.createElement("div");
    email.textContent = `Email: ${user.email}`;

    const city = document.createElement("div");
    city.textContent = `City: ${user.address.city}`;

    const company = document.createElement("div");
    company.textContent = `Company: ${user.company.name}`;

    li.append(name, email, city, company);
    usersList.append(li);
  });
}

// ---------- Filter the stored array ----------
function applyFilter() {
  if (allUsers.length === 0) {
    return;
  }
  const term = filterInput.value.trim().toLowerCase();
  const matches = allUsers.filter(function (user) {
    return user.name.toLowerCase().includes(term);
  });
  renderUsers(matches);
}

// ---------- Fetch the users ----------
async function loadUsers() {
  statusText.textContent = "Loading users...";
  loadButton.disabled = true;

  try {
    const response = await fetch(USERS_URL);
    if (!response.ok) {
      throw new Error(`Server responded with status ${response.status}`);
    }
    allUsers = await response.json();
    applyFilter();
    statusText.textContent = `Loaded ${allUsers.length} users.`;
  } catch (error) {
    console.error(error);
    statusText.textContent = "Could not load users. Please check your connection and try again.";
  } finally {
    loadButton.disabled = false;
  }
}

// ---------- Events ----------
loadButton.addEventListener("click", loadUsers);
filterInput.addEventListener("input", applyFilter);
