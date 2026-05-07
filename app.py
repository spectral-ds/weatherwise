from flask import Flask, render_template, request, jsonify, session, redirect, url_for
import sqlite3
import hashlib
import hmac
import os
import re
from dotenv import load_dotenv
load_dotenv()

app = Flask(__name__)
app.secret_key = os.environ.get("WW_SECRET", "weatherwise-secret-2024")

DB_PATH    = "weatherwise.db"

app.secret_key = os.environ.get("WW_SECRET")
ADMIN_PASS     = os.environ.get("WW_ADMIN_PASS")

if not app.secret_key:
    raise RuntimeError("WW_SECRET is not set in your .env file")
if not ADMIN_PASS:
    raise RuntimeError("WW_ADMIN_PASS is not set in your .env file")

# ═══════════════════════════════════════════
#  DATABASE
# ═══════════════════════════════════════════

def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys=ON")
    return conn

def init_db():
    with get_db() as conn:
        conn.executescript("""
            CREATE TABLE IF NOT EXISTS users (
                id            INTEGER PRIMARY KEY AUTOINCREMENT,
                name          TEXT    NOT NULL,
                email         TEXT    NOT NULL UNIQUE COLLATE NOCASE,
                password      TEXT    NOT NULL,
                created_at    TEXT    NOT NULL DEFAULT (datetime('now')),
                last_login    TEXT,
                alert_enabled INTEGER NOT NULL DEFAULT 0,
                alert_city    TEXT,
                alert_time    TEXT    NOT NULL DEFAULT '07:00',
                alert_freq    TEXT    NOT NULL DEFAULT 'daily'
            );
            CREATE TABLE IF NOT EXISTS history (
                id          INTEGER PRIMARY KEY AUTOINCREMENT,
                user_email  TEXT    NOT NULL COLLATE NOCASE,
                city        TEXT    NOT NULL,
                searched_at TEXT    NOT NULL DEFAULT (datetime('now')),
                FOREIGN KEY (user_email) REFERENCES users(email) ON DELETE CASCADE
            );
            CREATE INDEX IF NOT EXISTS idx_history_email ON history(user_email);
            CREATE INDEX IF NOT EXISTS idx_history_time  ON history(searched_at DESC);
        """)

init_db()

# ═══════════════════════════════════════════
#  HELPERS
# ═══════════════════════════════════════════

def hash_pw(pw):
    return hmac.new(app.secret_key.encode(), pw.encode(), hashlib.sha256).hexdigest()

def check_pw(pw, stored):
    return hmac.compare_digest(hash_pw(pw), stored)

def valid_email(e):
    return bool(re.match(r'^[^\s@]+@[^\s@]+\.[^\s@]+$', e.strip()))

# ═══════════════════════════════════════════
#  MAIN APP
# ═══════════════════════════════════════════

@app.route('/')
def home():
    return render_template('index.html')

# ── ADMIN (password-protected) ────────────

@app.route('/admin', methods=['GET', 'POST'])
def admin():
    if request.method == 'POST':
        pw = request.form.get('password', '')
        if pw == ADMIN_PASS:
            session['admin'] = True
            return redirect('/admin')
        return render_template('admin_login.html', error='Wrong password')
    if not session.get('admin'):
        return render_template('admin_login.html', error=None)
    return render_template('admin.html')

@app.route('/admin/logout')
def admin_logout():
    session.pop('admin', None)
    return redirect('/admin')

# ── AUTH ──────────────────────────────────

@app.route('/register', methods=['POST'])
def register():
    d = request.get_json(silent=True) or {}
    name  = (d.get('name',     '') or '').strip()
    email = (d.get('email',    '') or '').strip().lower()
    pw    = (d.get('password', '') or '')
    if not name or not email or not pw:
        return jsonify({"status":"error","message":"All fields are required"}), 400
    if not valid_email(email):
        return jsonify({"status":"error","message":"Invalid email address"}), 400
    if len(pw) < 6:
        return jsonify({"status":"error","message":"Password must be at least 6 characters"}), 400
    try:
        with get_db() as conn:
            conn.execute("INSERT INTO users (name,email,password) VALUES (?,?,?)",
                         (name, email, hash_pw(pw)))
        return jsonify({"status":"success"})
    except sqlite3.IntegrityError:
        return jsonify({"status":"error","message":"Email already registered"}), 409
    except Exception as e:
        return jsonify({"status":"error","message":"Server error"}), 500

@app.route('/login', methods=['POST'])
def login():
    d = request.get_json(silent=True) or {}
    email = (d.get('email',    '') or '').strip().lower()
    pw    = (d.get('password', '') or '')
    if not email or not pw:
        return jsonify({"status":"error","message":"Email and password required"}), 400
    try:
        with get_db() as conn:
            row = conn.execute("SELECT * FROM users WHERE email=?", (email,)).fetchone()
            if row and check_pw(pw, row['password']):
                conn.execute("UPDATE users SET last_login=datetime('now') WHERE email=?", (email,))
                return jsonify({
                    "status":"success", "name":row['name'], "email":row['email'],
                    "alert_enabled": bool(row['alert_enabled']),
                    "alert_city":  row['alert_city']  or '',
                    "alert_time":  row['alert_time']  or '07:00',
                    "alert_freq":  row['alert_freq']  or 'daily'
                })
        return jsonify({"status":"error","message":"Invalid email or password"}), 401
    except Exception as e:
        return jsonify({"status":"error","message":"Server error"}), 500

# ── HISTORY ───────────────────────────────

@app.route('/save_history', methods=['POST'])
def save_history():
    d     = request.get_json(silent=True) or {}
    email = (d.get('email','') or '').strip().lower()
    city  = (d.get('city', '') or '').strip()
    if not email or not city: return jsonify({"status":"error"}), 400
    try:
        with get_db() as conn:
            last = conn.execute(
                "SELECT city FROM history WHERE user_email=? ORDER BY searched_at DESC LIMIT 1",(email,)
            ).fetchone()
            if last and last['city'].lower() == city.lower():
                return jsonify({"status":"skipped"})
            conn.execute("INSERT INTO history (user_email,city) VALUES (?,?)", (email,city))
        return jsonify({"status":"saved"})
    except Exception as e:
        return jsonify({"status":"error"}), 500

@app.route('/get_history', methods=['POST'])
def get_history():
    d     = request.get_json(silent=True) or {}
    email = (d.get('email','') or '').strip().lower()
    if not email: return jsonify([])
    try:
        with get_db() as conn:
            rows = conn.execute(
                "SELECT id,city,searched_at FROM history WHERE user_email=? ORDER BY searched_at DESC LIMIT 20",
                (email,)
            ).fetchall()
        return jsonify([[r['id'],r['city'],r['searched_at']] for r in rows])
    except: return jsonify([])

@app.route('/delete_history', methods=['POST'])
def delete_history():
    d  = request.get_json(silent=True) or {}
    id = d.get('id')
    if id is None: return jsonify({"status":"error"}), 400
    try:
        with get_db() as conn:
            conn.execute("DELETE FROM history WHERE id=?", (id,))
        return jsonify({"status":"deleted"})
    except: return jsonify({"status":"error"}), 500

# ── PASSWORD RESET (in-app, no email needed) ─

@app.route('/check_email', methods=['POST'])
def check_email():
    """Step 1 — check if email exists in the database."""
    d     = request.get_json(silent=True) or {}
    email = (d.get('email', '') or '').strip().lower()
    if not email:
        return jsonify({"exists": False}), 400
    try:
        with get_db() as conn:
            row = conn.execute("SELECT id FROM users WHERE email=?", (email,)).fetchone()
        return jsonify({"exists": bool(row)})
    except Exception:
        return jsonify({"exists": False}), 500


@app.route('/reset_password_direct', methods=['POST'])
def reset_password_direct():
    """Step 2 — save the new password directly (no token needed)."""
    d        = request.get_json(silent=True) or {}
    email    = (d.get('email',    '') or '').strip().lower()
    password = (d.get('password', '') or '')
    if not email or not password:
        return jsonify({"status": "error", "message": "Missing data"}), 400
    if len(password) < 6:
        return jsonify({"status": "error", "message": "Password must be at least 6 characters"}), 400
    try:
        with get_db() as conn:
            user = conn.execute("SELECT id FROM users WHERE email=?", (email,)).fetchone()
            if not user:
                return jsonify({"status": "error", "message": "No account found with that email"}), 404
            conn.execute("UPDATE users SET password=? WHERE email=?", (hash_pw(password), email))
        return jsonify({"status": "success"})
    except Exception as e:
        app.logger.error(f"Reset error: {e}")
        return jsonify({"status": "error", "message": "Server error"}), 500


# ── ALERT SETTINGS ────────────────────────

@app.route('/update_alert', methods=['POST'])
def update_alert():
    d       = request.get_json(silent=True) or {}
    email   = (d.get('email','') or '').strip().lower()
    enabled = bool(d.get('enabled', False))
    city    = (d.get('city','')  or '').strip()
    time_   = (d.get('time','07:00') or '07:00').strip()
    freq    = (d.get('freq','daily') or 'daily').strip()
    if not email: return jsonify({"status":"error"}), 400
    try:
        with get_db() as conn:
            conn.execute(
                "UPDATE users SET alert_enabled=?,alert_city=?,alert_time=?,alert_freq=? WHERE email=?",
                (1 if enabled else 0, city, time_, freq, email)
            )
        return jsonify({"status":"saved"})
    except Exception as e:
        return jsonify({"status":"error"}), 500

# ── ADMIN API (all require admin session) ─

def admin_required(fn):
    from functools import wraps
    @wraps(fn)
    def wrapper(*args, **kwargs):
        if not session.get('admin'):
            return jsonify({"error":"Unauthorized"}), 401
        return fn(*args, **kwargs)
    return wrapper

@app.route('/admin/stats')
@admin_required
def admin_stats():
    with get_db() as conn:
        users     = conn.execute("SELECT COUNT(*) FROM users").fetchone()[0]
        searches  = conn.execute("SELECT COUNT(*) FROM history").fetchone()[0]
        alerts_on = conn.execute("SELECT COUNT(*) FROM users WHERE alert_enabled=1").fetchone()[0]
        top       = conn.execute(
            "SELECT city, COUNT(*) c FROM history GROUP BY LOWER(city) ORDER BY c DESC LIMIT 8"
        ).fetchall()
    return jsonify({
        "users":users, "searches":searches, "alerts_on":alerts_on,
        "top_cities":[[r['city'],r['c']] for r in top]
    })

@app.route('/admin/users')
@admin_required
def admin_users():
    with get_db() as conn:
        rows = conn.execute("""
            SELECT u.id,u.name,u.email,u.created_at,u.last_login,
                   u.alert_enabled,u.alert_city,u.alert_time,u.alert_freq,
                   COUNT(h.id) search_count
            FROM users u LEFT JOIN history h ON h.user_email=u.email
            GROUP BY u.id ORDER BY u.created_at DESC
        """).fetchall()
    return jsonify([dict(r) for r in rows])

@app.route('/admin/history')
@admin_required
def admin_history():
    limit = int(request.args.get('limit',100))
    email = request.args.get('email','')
    with get_db() as conn:
        if email:
            rows = conn.execute(
                "SELECT * FROM history WHERE user_email=? ORDER BY searched_at DESC LIMIT ?",(email,limit)
            ).fetchall()
        else:
            rows = conn.execute(
                "SELECT * FROM history ORDER BY searched_at DESC LIMIT ?",(limit,)
            ).fetchall()
    return jsonify([dict(r) for r in rows])

@app.route('/admin/delete_user', methods=['POST'])
@admin_required
def admin_delete_user():
    d     = request.get_json(silent=True) or {}
    email = (d.get('email','') or '').strip().lower()
    if not email: return jsonify({"status":"error"}), 400
    with get_db() as conn:
        conn.execute("DELETE FROM users WHERE email=?", (email,))
    return jsonify({"status":"deleted"})

@app.route('/admin/delete_user_history', methods=['POST'])
@admin_required
def admin_delete_user_history():
    d     = request.get_json(silent=True) or {}
    email = (d.get('email','') or '').strip().lower()
    if not email: return jsonify({"status":"error"}), 400
    with get_db() as conn:
        conn.execute("DELETE FROM history WHERE user_email=?", (email,))
    return jsonify({"status":"cleared"})

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    app.run(host='0.0.0.0', port=port, debug=False)
