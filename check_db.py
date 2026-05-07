"""
check_db.py — WeatherWise database inspector utility
Usage: python check_db.py [--users] [--history] [--all] [--stats]
"""

import sqlite3
import sys
import os
from datetime import datetime

DB_PATH = "weatherwise.db"


def get_conn():
    if not os.path.exists(DB_PATH):
        print(f"❌  Database not found: {DB_PATH}")
        print("    Run app.py at least once to initialize the database.")
        sys.exit(1)
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def print_users():
    conn = get_conn()
    rows = conn.execute("SELECT id, name, email, created_at, last_login FROM users ORDER BY id").fetchall()
    conn.close()

    if not rows:
        print("👤  No users registered yet.")
        return

    print(f"\n{'─'*70}")
    print(f"  {'ID':<5} {'Name':<20} {'Email':<30} {'Registered':<20}")
    print(f"{'─'*70}")
    for r in rows:
        print(f"  {r['id']:<5} {r['name']:<20} {r['email']:<30} {r['created_at'][:16]}")
    print(f"{'─'*70}")
    print(f"  Total users: {len(rows)}\n")


def print_history(limit=50):
    conn = get_conn()
    rows = conn.execute(
        "SELECT id, user_email, city, searched_at FROM history ORDER BY searched_at DESC LIMIT ?",
        (limit,)
    ).fetchall()
    conn.close()

    if not rows:
        print("📜  No history entries yet.")
        return

    print(f"\n{'─'*70}")
    print(f"  {'ID':<6} {'Email':<30} {'City':<20} {'When'}")
    print(f"{'─'*70}")
    for r in rows:
        print(f"  {r['id']:<6} {r['user_email']:<30} {r['city']:<20} {r['searched_at'][:16]}")
    print(f"{'─'*70}")
    print(f"  Showing {len(rows)} most recent entries\n")


def print_stats():
    conn = get_conn()

    user_count    = conn.execute("SELECT COUNT(*) FROM users").fetchone()[0]
    history_count = conn.execute("SELECT COUNT(*) FROM history").fetchone()[0]

    top_cities = conn.execute(
        "SELECT city, COUNT(*) as cnt FROM history GROUP BY LOWER(city) ORDER BY cnt DESC LIMIT 5"
    ).fetchall()

    top_users = conn.execute(
        "SELECT user_email, COUNT(*) as cnt FROM history GROUP BY LOWER(user_email) ORDER BY cnt DESC LIMIT 5"
    ).fetchall()

    conn.close()

    print(f"\n{'═'*50}")
    print("  📊  WeatherWise Database Stats")
    print(f"{'═'*50}")
    print(f"  Users:              {user_count}")
    print(f"  History entries:    {history_count}")

    if top_cities:
        print(f"\n  🏙️  Top searched cities:")
        for r in top_cities:
            print(f"      {r['city']:<20} {r['cnt']} searches")

    if top_users:
        print(f"\n  🔍  Most active users:")
        for r in top_users:
            print(f"      {r['user_email']:<30} {r['cnt']} searches")

    print(f"{'═'*50}\n")


def main():
    args = sys.argv[1:]
    if not args or '--all' in args:
        print_stats()
        print_users()
        print_history()
    else:
        if '--stats' in args:   print_stats()
        if '--users' in args:   print_users()
        if '--history' in args: print_history()


if __name__ == '__main__':
    main()
