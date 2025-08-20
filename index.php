<?php
header("Content-Type: application/json");
header("Access-Control-Allow-Origin: http://localhost:5500"); // CHANGE to your front-end origin
header("Access-Control-Allow-Credentials: true");

$mysqli = new mysqli("localhost", "db_user", "db_pass", "auth_demo");
if ($mysqli->connect_error) {
    http_response_code(500);
    echo json_encode(["error" => "DB connection failed"]);
    exit;
}

function start_session_if_needed() {
    if (session_status() !== PHP_SESSION_ACTIVE) session_start();
}

function require_admin() {
    start_session_if_needed();
    if (!isset($_SESSION['user_id']) || empty($_SESSION['is_admin'])) {
        http_response_code(403);
        echo json_encode(["error" => "Admin only"]);
        exit;
    }
}

$input = json_decode(file_get_contents("php://input"), true);
$action = $_GET['action'] ?? '';

// ---------- SIGNUP ----------
if ($action === 'signup') {
    $email = strtolower(trim($input['email'] ?? ''));
    $password = $input['password'] ?? '';
    if (!$email || !$password) {
        http_response_code(400);
        echo json_encode(["error" => "Email and password required"]);
        exit;
    }
    // prevent self-assigning admin at signup (server controls this)
    $stmt = $mysqli->prepare("SELECT id FROM users WHERE email=?");
    $stmt->bind_param("s", $email);
    $stmt->execute();
    $stmt->store_result();
    if ($stmt->num_rows > 0) {
        http_response_code(409);
        echo json_encode(["error" => "Email already registered"]);
        exit;
    }
    $hash = password_hash($password, PASSWORD_DEFAULT);
    $stmt = $mysqli->prepare("INSERT INTO users (email, password_hash, is_admin) VALUES (?, ?, 0)");
    $stmt->bind_param("ss", $email, $hash);
    $stmt->execute();

    // auto-login after signup
    start_session_if_needed();
    $_SESSION['user_id'] = $stmt->insert_id;
    $_SESSION['is_admin'] = 0;

    echo json_encode(["user" => ["id" => $stmt->insert_id, "email" => $email, "is_admin" => 0]]);
    exit;
}

// ---------- SIGNIN (works for both users and admins) ----------
if ($action === 'signin') {
    $email = strtolower(trim($input['email'] ?? ''));
    $password = $input['password'] ?? '';

    $stmt = $mysqli->prepare("SELECT id, password_hash, is_admin FROM users WHERE email=?");
    $stmt->bind_param("s", $email);
    $stmt->execute();
    $res = $stmt->get_result();
    $user = $res->fetch_assoc();

    if (!$user || !password_verify($password, $user['password_hash'])) {
        http_response_code(401);
        echo json_encode(["error" => "Invalid credentials"]);
        exit;
    }
    start_session_if_needed();
    $_SESSION['user_id'] = $user['id'];
    $_SESSION['is_admin'] = (int)$user['is_admin'];

    echo json_encode(["user" => ["id" => $user['id'], "email" => $email, "is_admin" => (int)$user['is_admin']]]);
    exit;
}

// ---------- CURRENT USER ----------
if ($action === 'me') {
    start_session_if_needed();
    if (!isset($_SESSION['user_id'])) { echo json_encode(["user" => null]); exit; }
    $id = (int)$_SESSION['user_id'];

    $stmt = $mysqli->prepare("SELECT id, email, created_at, is_admin FROM users WHERE id=?");
    $stmt->bind_param("i", $id);
    $stmt->execute();
    $user = $stmt->get_result()->fetch_assoc();

    echo json_encode(["user" => $user ?: null]);
    exit;
}

// ---------- SIGNOUT ----------
if ($action === 'signout') {
    start_session_if_needed();
    session_destroy();
    echo json_encode(["ok" => true]);
    exit;
}

// ---------- ADMIN: list users (paginated) ----------
if ($action === 'admin_list_users') {
    require_admin();

    $page = max(1, (int)($_GET['page'] ?? 1));
    $pageSize = min(100, max(1, (int)($_GET['pageSize'] ?? 20)));
    $offset = ($page - 1) * $pageSize;

    // optional search by email
    $q = trim($_GET['q'] ?? '');
    if ($q !== '') {
        $like = '%' . $q . '%';
        $stmt = $mysqli->prepare("SELECT COUNT(*) AS c FROM users WHERE email LIKE ?");
        $stmt->bind_param("s", $like);
        $stmt->execute();
        $count = $stmt->get_result()->fetch_assoc()['c'];

        $stmt = $mysqli->prepare("SELECT id, email, created_at, is_admin FROM users WHERE email LIKE ? ORDER BY id DESC LIMIT ? OFFSET ?");
        $stmt->bind_param("sii", $like, $pageSize, $offset);
        $stmt->execute();
        $rows = $stmt->get_result()->fetch_all(MYSQLI_ASSOC);
    } else {
        $count = $mysqli->query("SELECT COUNT(*) AS c FROM users")->fetch_assoc()['c'];
        $stmt = $mysqli->prepare("SELECT id, email, created_at, is_admin FROM users ORDER BY id DESC LIMIT ? OFFSET ?");
        $stmt->bind_param("ii", $pageSize, $offset);
        $stmt->execute();
        $rows = $stmt->get_result()->fetch_all(MYSQLI_ASSOC);
    }

    echo json_encode([
        "page" => $page,
        "pageSize" => $pageSize,
        "total" => (int)$count,
        "users" => $rows
    ]);
    exit;
}

http_response_code(404);
echo json_encode(["error" => "Unknown action"]);
