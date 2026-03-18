import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.db.base_class import Base
from app.db.session import engine
from app.routers import (
    auth,
    me,
    tutors,
    requests,
    responses,
    assignments,
    threads,
    notifications,
    messages,
    offers,
    users,
)
from app.routers.telegram import router as telegram_router

app = FastAPI(title="Repetitor18 App API")

logger = logging.getLogger("repetitor_app_api")

app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=r"^https?://(app\.repetitor18\.ru|api\.app\.repetitor18\.ru)$",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def _ensure_users_telegram_nullable(conn) -> None:
    """SQLite: if users.telegram_id was created as NOT NULL, rebuild table to allow NULLs.

    This keeps existing columns and unique constraints and is safe to run multiple times.
    """
    try:
        cols = conn.exec_driver_sql("PRAGMA table_info('users')").fetchall()
    except Exception:
        return

    # PRAGMA table_info returns: cid, name, type, notnull, dflt_value, pk
    tgid_row = next((c for c in cols if c[1] == "telegram_id"), None)
    if not tgid_row:
        return

    notnull = int(tgid_row[3] or 0)
    if notnull == 0:
        return  # already nullable

    logger.warning("Rebuilding users table to make telegram_id nullable (SQLite)")

    # Collect unique constraints (excluding PK)
    uniqs = []
    try:
        for idx in conn.exec_driver_sql("PRAGMA index_list('users')").fetchall():
            # index_list: seq, name, unique, origin, partial
            if int(idx[2] or 0) != 1:
                continue
            if str(idx[3]) == "pk":
                continue
            idx_name = idx[1]
            icols = conn.exec_driver_sql(f"PRAGMA index_info('{idx_name}')").fetchall()
            ucols = [r[2] for r in icols if r[2]]
            if ucols:
                uniqs.append(ucols)
    except Exception:
        uniqs = []

    # Build CREATE TABLE statement from current columns
    col_defs = []
    col_names = []
    for (_cid, name, ctype, c_notnull, dflt, pk) in cols:
        col_names.append(name)
        ctype = (ctype or "").strip() or "TEXT"

        parts = [f'"{name}" {ctype}']
        if int(pk or 0) == 1:
            # Preserve PK behaviour
            if ctype.upper() == "INTEGER":
                parts.append("PRIMARY KEY AUTOINCREMENT")
            else:
                parts.append("PRIMARY KEY")
        else:
            # Make telegram_id nullable
            if name != "telegram_id" and int(c_notnull or 0) == 1:
                parts.append("NOT NULL")

        if dflt is not None:
            parts.append(f"DEFAULT {dflt}")

        col_defs.append(" ".join(parts))

    for ucols in uniqs:
        quoted = ",".join([f'"{c}"' for c in ucols])
        col_defs.append(f"UNIQUE ({quoted})")

    create_sql = "CREATE TABLE users__new (\n  " + ",\n  ".join(col_defs) + "\n);"

    conn.exec_driver_sql("PRAGMA foreign_keys=OFF")
    try:
        conn.exec_driver_sql("DROP TABLE IF EXISTS users__new")
        conn.exec_driver_sql(create_sql)
        cols_csv = ",".join([f'"{c}"' for c in col_names])
        conn.exec_driver_sql(f"INSERT INTO users__new ({cols_csv}) SELECT {cols_csv} FROM users;")
        conn.exec_driver_sql("DROP TABLE users;")
        conn.exec_driver_sql("ALTER TABLE users__new RENAME TO users;")
    finally:
        conn.exec_driver_sql("PRAGMA foreign_keys=ON")




def _ensure_auth_identities_users_fk(conn) -> None:
    """SQLite: fix broken FK in auth_identities that may reference a renamed users table (users_old).

    In early MVP migrations the users table could be rebuilt/renamed, and SQLite keeps the original
    FK target table name inside child tables. If that target no longer exists, any INSERT into the
    child table crashes with: "no such table: main.users_old".

    This rebuild is idempotent and preserves existing data.
    """
    try:
        tables = {r[0] for r in conn.exec_driver_sql("SELECT name FROM sqlite_master WHERE type='table'").fetchall()}
    except Exception:
        return

    if "auth_identities" not in tables:
        return

    try:
        fk_rows = conn.exec_driver_sql("PRAGMA foreign_key_list('auth_identities')").fetchall()
    except Exception:
        fk_rows = []

    # foreign_key_list columns: id, seq, table, from, to, on_update, on_delete, match
    fk_targets = {r[2] for r in fk_rows if len(r) > 2 and r[2]}
    if fk_targets and fk_targets <= {"users"}:
        return  # already OK

    if "users_old" not in fk_targets and "users" in fk_targets:
        # Mixed/unknown but includes users; leave it.
        return

    logger.warning("Rebuilding auth_identities table to fix FK target (%s)", ",".join(sorted(fk_targets)) or "none")

    desired_cols = [
        ("id", "INTEGER"),
        ("user_id", "INTEGER"),
        ("provider", "VARCHAR(16)"),
        ("provider_user_id", "VARCHAR(128)"),
        ("email_normalized", "VARCHAR(255)"),
        ("is_verified", "INTEGER"),
        ("created_at", "DATETIME"),
    ]

    # Discover existing columns
    try:
        cols = conn.exec_driver_sql("PRAGMA table_info('auth_identities')").fetchall()
        existing = {c[1] for c in cols if len(c) > 1}
    except Exception:
        existing = set()

    create_sql = """
        CREATE TABLE auth_identities__new (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            provider VARCHAR(16) NOT NULL,
            provider_user_id VARCHAR(128),
            email_normalized VARCHAR(255),
            is_verified INTEGER NOT NULL DEFAULT 0,
            created_at DATETIME NOT NULL,
            UNIQUE(provider, provider_user_id),
            UNIQUE(email_normalized),
            FOREIGN KEY(user_id) REFERENCES users(id)
        );
    """

    # Build INSERT ... SELECT with only existing source columns
    target_cols = [c for (c, _t) in desired_cols]
    select_exprs = []
    for c, _t in desired_cols:
        if c in existing:
            select_exprs.append(f'"{c}"')
        else:
            if c == "is_verified":
                select_exprs.append("0")
            else:
                select_exprs.append("NULL")

    conn.exec_driver_sql("PRAGMA foreign_keys=OFF")
    try:
        conn.exec_driver_sql("DROP TABLE IF EXISTS auth_identities__new")
        conn.exec_driver_sql(create_sql)
        tgt = ",".join([f'"{c}"' for c in target_cols])
        sel = ",".join(select_exprs)
        conn.exec_driver_sql(f"INSERT INTO auth_identities__new ({tgt}) SELECT {sel} FROM auth_identities;")
        conn.exec_driver_sql("DROP TABLE auth_identities;")
        conn.exec_driver_sql("ALTER TABLE auth_identities__new RENAME TO auth_identities;")
        # Optional indexes (non-fatal)
        try:
            conn.exec_driver_sql("CREATE INDEX IF NOT EXISTS ix_auth_identities_provider ON auth_identities(provider);")
            conn.exec_driver_sql("CREATE INDEX IF NOT EXISTS ix_auth_identities_user_id ON auth_identities(user_id);")
        except Exception:
            pass
    finally:
        conn.exec_driver_sql("PRAGMA foreign_keys=ON")




def _sqlite_table_names(conn) -> set:
    try:
        return {r[0] for r in conn.exec_driver_sql("SELECT name FROM sqlite_master WHERE type='table'").fetchall()}
    except Exception:
        return set()


def _sqlite_fk_targets(conn, table: str) -> set:
    try:
        rows = conn.exec_driver_sql(f"PRAGMA foreign_key_list('{table}')").fetchall()
    except Exception:
        rows = []
    # foreign_key_list columns: id, seq, table, from, to, on_update, on_delete, match
    return {r[2] for r in rows if len(r) > 2 and r[2]}


def _sqlite_rebuild_table(conn, table: str, create_sql: str, desired_cols: list, default_exprs: dict, indexes_sql: list) -> None:
    """SQLite: rebuild a table with corrected schema/FKs while preserving data.

    - desired_cols: ordered list of column names for the new table
    - default_exprs: mapping col -> SQL expression used when the source column is missing
    - indexes_sql: list of CREATE INDEX statements to run after rebuild (best-effort)
    """
    try:
        cols = conn.exec_driver_sql(f"PRAGMA table_info('{table}')").fetchall()
        existing = {c[1] for c in cols if len(c) > 1}
    except Exception:
        existing = set()

    new_table = f"{table}__new"
    tgt_cols_csv = ",".join([f'"{c}"' for c in desired_cols])
    select_exprs = []
    for c in desired_cols:
        if c in existing:
            select_exprs.append(f'"{c}"')
        else:
            select_exprs.append(default_exprs.get(c, "NULL"))
    sel_csv = ",".join(select_exprs)

    conn.exec_driver_sql("PRAGMA foreign_keys=OFF")
    try:
        conn.exec_driver_sql(f"DROP TABLE IF EXISTS {new_table}")
        conn.exec_driver_sql(create_sql)
        conn.exec_driver_sql(f"INSERT INTO {new_table} ({tgt_cols_csv}) SELECT {sel_csv} FROM {table};")
        conn.exec_driver_sql(f"DROP TABLE {table};")
        conn.exec_driver_sql(f"ALTER TABLE {new_table} RENAME TO {table};")
        for sql in indexes_sql or []:
            try:
                conn.exec_driver_sql(sql)
            except Exception:
                pass
    finally:
        conn.exec_driver_sql("PRAGMA foreign_keys=ON")


def _ensure_requests_users_fk(conn) -> None:
    """SQLite: fix broken FK target inside requests (users_old -> users)."""
    tables = _sqlite_table_names(conn)
    if "requests" not in tables:
        return
    fk_targets = _sqlite_fk_targets(conn, "requests")
    if fk_targets and fk_targets <= {"users"}:
        return
    if "users_old" not in fk_targets and all(t in tables for t in fk_targets):
        return

    logger.warning("Rebuilding requests table to fix FK targets (%s)", ",".join(sorted(fk_targets)) or "none")

    create_sql = """
        CREATE TABLE requests__new (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            author_user_id INTEGER NOT NULL,
            request_kind TEXT NOT NULL,
            subject TEXT NOT NULL,
            level TEXT NOT NULL,
            format TEXT NOT NULL,
            city TEXT,
            budget_text TEXT,
            schedule_text TEXT,
            description TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'open',
            slug TEXT NOT NULL DEFAULT '',
            seo_title TEXT,
            seo_description TEXT,
            commission_type TEXT,
            commission_value INTEGER,
            currency TEXT,
            turbo_enabled INTEGER NOT NULL DEFAULT 0,
            turbo_status TEXT,
            turbo_sent_at DATETIME,
            assigned_user_id INTEGER,
            assigned_at DATETIME,
            created_at DATETIME NOT NULL,
            updated_at DATETIME NOT NULL,
            FOREIGN KEY(author_user_id) REFERENCES users(id)
        );
    """

    desired_cols = [
        "id","author_user_id","request_kind","subject","level","format","city","budget_text","schedule_text",
        "description","status","slug","seo_title","seo_description","commission_type","commission_value","currency",
        "turbo_enabled","turbo_status","turbo_sent_at","assigned_user_id","assigned_at","created_at","updated_at"
    ]
    default_exprs = {
        "status": "'open'",
        "slug": "''",
        "turbo_enabled": "0",
        "created_at": "CURRENT_TIMESTAMP",
        "updated_at": "CURRENT_TIMESTAMP",
    }
    indexes_sql = [
        "CREATE INDEX IF NOT EXISTS ix_requests_author_user_id ON requests(author_user_id);",
        "CREATE INDEX IF NOT EXISTS ix_requests_status ON requests(status);",
    ]
    _sqlite_rebuild_table(conn, "requests", create_sql, desired_cols, default_exprs, indexes_sql)


def _ensure_threads_fks(conn) -> None:
    """SQLite: fix broken FK targets inside threads (users_old/requests_old -> users/requests)."""
    tables = _sqlite_table_names(conn)
    if "threads" not in tables:
        return
    fk_targets = _sqlite_fk_targets(conn, "threads")
    ok_targets = {"users", "requests"}
    if fk_targets and fk_targets <= ok_targets:
        return
    if all(t in tables for t in fk_targets):
        return

    logger.warning("Rebuilding threads table to fix FK targets (%s)", ",".join(sorted(fk_targets)) or "none")

    create_sql = """
        CREATE TABLE threads__new (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            request_id INTEGER NOT NULL,
            author_user_id INTEGER NOT NULL,
            tutor_user_id INTEGER NOT NULL,
            created_at DATETIME NOT NULL,
            UNIQUE(request_id),
            FOREIGN KEY(request_id) REFERENCES requests(id) ON DELETE CASCADE,
            FOREIGN KEY(author_user_id) REFERENCES users(id) ON DELETE CASCADE,
            FOREIGN KEY(tutor_user_id) REFERENCES users(id) ON DELETE CASCADE
        );
    """
    desired_cols = ["id","request_id","author_user_id","tutor_user_id","created_at"]
    default_exprs = {"created_at": "CURRENT_TIMESTAMP"}
    indexes_sql = [
        "CREATE INDEX IF NOT EXISTS ix_threads_request_id ON threads(request_id);",
        "CREATE INDEX IF NOT EXISTS ix_threads_author_user_id ON threads(author_user_id);",
        "CREATE INDEX IF NOT EXISTS ix_threads_tutor_user_id ON threads(tutor_user_id);",
    ]
    _sqlite_rebuild_table(conn, "threads", create_sql, desired_cols, default_exprs, indexes_sql)


def _ensure_messages_fks(conn) -> None:
    """SQLite: fix broken FK targets inside messages (users_old/threads_old -> users/threads)."""
    tables = _sqlite_table_names(conn)
    if "messages" not in tables:
        return
    fk_targets = _sqlite_fk_targets(conn, "messages")
    ok_targets = {"users", "threads"}
    if fk_targets and fk_targets <= ok_targets:
        return
    if all(t in tables for t in fk_targets):
        return

    logger.warning("Rebuilding messages table to fix FK targets (%s)", ",".join(sorted(fk_targets)) or "none")

    create_sql = """
        CREATE TABLE messages__new (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            thread_id INTEGER NOT NULL,
            sender_user_id INTEGER NOT NULL,
            text TEXT NOT NULL,
            created_at DATETIME NOT NULL,
            read_at DATETIME,
            FOREIGN KEY(thread_id) REFERENCES threads(id) ON DELETE CASCADE,
            FOREIGN KEY(sender_user_id) REFERENCES users(id) ON DELETE CASCADE
        );
    """
    desired_cols = ["id","thread_id","sender_user_id","text","created_at","read_at"]
    default_exprs = {"created_at": "CURRENT_TIMESTAMP"}
    indexes_sql = [
        "CREATE INDEX IF NOT EXISTS ix_messages_thread_id ON messages(thread_id);",
        "CREATE INDEX IF NOT EXISTS ix_messages_sender_user_id ON messages(sender_user_id);",
        "CREATE INDEX IF NOT EXISTS ix_messages_created_at ON messages(created_at);",
    ]
    _sqlite_rebuild_table(conn, "messages", create_sql, desired_cols, default_exprs, indexes_sql)


def _ensure_responses_fks(conn) -> None:
    """SQLite: fix broken FK targets inside responses (users_old/requests_old -> users/requests)."""
    tables = _sqlite_table_names(conn)
    if "responses" not in tables:
        return
    fk_targets = _sqlite_fk_targets(conn, "responses")
    ok_targets = {"users", "requests"}
    if fk_targets and fk_targets <= ok_targets:
        return
    if all(t in tables for t in fk_targets):
        return

    logger.warning("Rebuilding responses table to fix FK targets (%s)", ",".join(sorted(fk_targets)) or "none")

    create_sql = """
        CREATE TABLE responses__new (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            request_id INTEGER NOT NULL,
            from_user_id INTEGER NOT NULL,
            message TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'sent',
            created_at DATETIME NOT NULL,
            FOREIGN KEY(request_id) REFERENCES requests(id),
            FOREIGN KEY(from_user_id) REFERENCES users(id)
        );
    """
    desired_cols = ["id","request_id","from_user_id","message","status","created_at"]
    default_exprs = {"status": "'sent'", "created_at": "CURRENT_TIMESTAMP"}
    indexes_sql = [
        "CREATE INDEX IF NOT EXISTS ix_responses_request_id ON responses(request_id);",
        "CREATE INDEX IF NOT EXISTS ix_responses_from_user_id ON responses(from_user_id);",
        "CREATE INDEX IF NOT EXISTS ix_responses_created_at ON responses(created_at);",
    ]
    _sqlite_rebuild_table(conn, "responses", create_sql, desired_cols, default_exprs, indexes_sql)


def _ensure_assignments_fks(conn) -> None:
    """SQLite: fix broken FK targets inside assignments (users_old/requests_old -> users/requests)."""
    tables = _sqlite_table_names(conn)
    if "assignments" not in tables:
        return
    fk_targets = _sqlite_fk_targets(conn, "assignments")
    ok_targets = {"users", "requests"}
    if fk_targets and fk_targets <= ok_targets:
        return
    if all(t in tables for t in fk_targets):
        return

    logger.warning("Rebuilding assignments table to fix FK targets (%s)", ",".join(sorted(fk_targets)) or "none")

    create_sql = """
        CREATE TABLE assignments__new (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            request_id INTEGER NOT NULL,
            tutor_user_id INTEGER NOT NULL,
            status VARCHAR(16) NOT NULL DEFAULT 'active',
            created_at DATETIME NOT NULL,
            UNIQUE(request_id),
            FOREIGN KEY(request_id) REFERENCES requests(id) ON DELETE CASCADE,
            FOREIGN KEY(tutor_user_id) REFERENCES users(id) ON DELETE CASCADE
        );
    """
    desired_cols = ["id","request_id","tutor_user_id","status","created_at"]
    default_exprs = {"status": "'active'", "created_at": "CURRENT_TIMESTAMP"}
    indexes_sql = [
        "CREATE INDEX IF NOT EXISTS ix_assignments_request_id ON assignments(request_id);",
        "CREATE INDEX IF NOT EXISTS ix_assignments_tutor_user_id ON assignments(tutor_user_id);",
        "CREATE INDEX IF NOT EXISTS ix_assignments_status ON assignments(status);",
    ]
    _sqlite_rebuild_table(conn, "assignments", create_sql, desired_cols, default_exprs, indexes_sql)


def _ensure_offers_fks(conn) -> None:
    """SQLite: fix broken FK targets inside offers (users_old/requests_old -> users/requests)."""
    tables = _sqlite_table_names(conn)
    if "offers" not in tables:
        return
    fk_targets = _sqlite_fk_targets(conn, "offers")
    ok_targets = {"users", "requests"}
    if fk_targets and fk_targets <= ok_targets:
        return
    if all(t in tables for t in fk_targets):
        return

    logger.warning("Rebuilding offers table to fix FK targets (%s)", ",".join(sorted(fk_targets)) or "none")

    create_sql = """
        CREATE TABLE offers__new (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            request_id INTEGER NOT NULL,
            to_tutor_user_id INTEGER NOT NULL,
            message TEXT,
            status VARCHAR(16) NOT NULL DEFAULT 'sent',
            created_at DATETIME NOT NULL,
            UNIQUE(request_id, to_tutor_user_id),
            FOREIGN KEY(request_id) REFERENCES requests(id) ON DELETE CASCADE,
            FOREIGN KEY(to_tutor_user_id) REFERENCES users(id) ON DELETE CASCADE
        );
    """
    desired_cols = ["id","request_id","to_tutor_user_id","message","status","created_at"]
    default_exprs = {"status": "'sent'", "created_at": "CURRENT_TIMESTAMP"}
    indexes_sql = [
        "CREATE INDEX IF NOT EXISTS ix_offers_request_id ON offers(request_id);",
        "CREATE INDEX IF NOT EXISTS ix_offers_to_tutor_user_id ON offers(to_tutor_user_id);",
        "CREATE INDEX IF NOT EXISTS ix_offers_status ON offers(status);",
    ]
    _sqlite_rebuild_table(conn, "offers", create_sql, desired_cols, default_exprs, indexes_sql)


def _ensure_notifications_fk(conn) -> None:
    """SQLite: fix broken FK targets inside notifications (users_old -> users)."""
    tables = _sqlite_table_names(conn)
    if "notifications" not in tables:
        return
    fk_targets = _sqlite_fk_targets(conn, "notifications")
    if fk_targets and fk_targets <= {"users"}:
        return
    if all(t in tables for t in fk_targets):
        return

    logger.warning("Rebuilding notifications table to fix FK targets (%s)", ",".join(sorted(fk_targets)) or "none")

    create_sql = """
        CREATE TABLE notifications__new (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            type TEXT NOT NULL,
            entity_id INTEGER,
            title TEXT NOT NULL,
            body TEXT,
            is_read INTEGER NOT NULL DEFAULT 0,
            telegram_sent_at DATETIME,
            created_at DATETIME NOT NULL,
            FOREIGN KEY(user_id) REFERENCES users(id)
        );
    """
    desired_cols = ["id","user_id","type","entity_id","title","body","is_read","telegram_sent_at","created_at"]
    default_exprs = {"is_read": "0", "created_at": "CURRENT_TIMESTAMP"}
    indexes_sql = [
        "CREATE INDEX IF NOT EXISTS ix_notifications_user_id ON notifications(user_id);",
        "CREATE INDEX IF NOT EXISTS ix_notifications_is_read ON notifications(is_read);",
        "CREATE INDEX IF NOT EXISTS ix_notifications_created_at ON notifications(created_at);",
    ]
    _sqlite_rebuild_table(conn, "notifications", create_sql, desired_cols, default_exprs, indexes_sql)


def _ensure_tutor_profiles_fk(conn) -> None:
    """SQLite: fix broken FK target inside tutor_profiles (users_old -> users).

    Symptom: inserts fail with `sqlite3.OperationalError: no such table: main.users_old`.
    This happens when tutor_profiles has a foreign key referencing a renamed table.
    """
    tables = _sqlite_table_names(conn)
    if "tutor_profiles" not in tables:
        return
    fk_targets = _sqlite_fk_targets(conn, "tutor_profiles")
    if fk_targets and fk_targets <= {"users"}:
        return
    # If all FK targets exist and none is users_old, leave it
    if "users_old" not in fk_targets and all(t in tables for t in fk_targets):
        return

    logger.warning(
        "Rebuilding tutor_profiles table to fix FK targets (%s)",
        ",".join(sorted(fk_targets)) or "none",
    )

    create_sql = """
        CREATE TABLE tutor_profiles__new (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL UNIQUE,
            bumped_at DATETIME,
            display_name VARCHAR(128) NOT NULL,
            bio TEXT NOT NULL,
            subjects_json TEXT NOT NULL DEFAULT '[]',
            levels_json TEXT NOT NULL DEFAULT '[]',
            formats_json TEXT NOT NULL DEFAULT '[]',
            city VARCHAR(128),
            price_from INTEGER,
            price_to INTEGER,
            is_listed INTEGER NOT NULL DEFAULT 0,
            slug VARCHAR(128) NOT NULL DEFAULT '',
            seo_title VARCHAR(256),
            seo_description VARCHAR(512),
            telegram_contact VARCHAR(128),
            uploaded_photo_filename VARCHAR(255),
            updated_at DATETIME NOT NULL,
            FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
        );
    """

    desired_cols = [
        "id",
        "user_id",
        "bumped_at",
        "display_name",
        "bio",
        "subjects_json",
        "levels_json",
        "formats_json",
        "city",
        "price_from",
        "price_to",
        "is_listed",
        "slug",
        "seo_title",
        "seo_description",
        "telegram_contact",
        "uploaded_photo_filename",
        "updated_at",
    ]
    default_exprs = {
        "subjects_json": "'[]'",
        "levels_json": "'[]'",
        "formats_json": "'[]'",
        "is_listed": "0",
        "slug": "''",
        "updated_at": "CURRENT_TIMESTAMP",
    }
    indexes_sql = [
        "CREATE UNIQUE INDEX IF NOT EXISTS ix_tutor_profiles_user_id ON tutor_profiles(user_id);",
        "CREATE INDEX IF NOT EXISTS ix_tutor_profiles_slug ON tutor_profiles(slug);",
        "CREATE INDEX IF NOT EXISTS ix_tutor_profiles_is_listed ON tutor_profiles(is_listed);",
    ]
    _sqlite_rebuild_table(conn, "tutor_profiles", create_sql, desired_cols, default_exprs, indexes_sql)

def _bootstrap_sqlite(conn) -> None:
    """Idempotent bootstrap for MVP DB (SQLite)."""

    def _ensure_tg_link_tokens_fk_users(conn) -> None:
        """Fix legacy SQLite schema where tg_link_tokens.user_id FK points to users_old.

        Symptoms:
          sqlite3.OperationalError: no such table: main.users_old
        during INSERT into tg_link_tokens.
        """
        try:
            fk_rows = conn.exec_driver_sql("PRAGMA foreign_key_list('tg_link_tokens')").fetchall()
        except Exception:
            fk_rows = []

        if not fk_rows:
            return

        # PRAGMA foreign_key_list columns: (id, seq, table, from, to, on_update, on_delete, match)
        ref_tables = {r[2] for r in fk_rows if len(r) > 2}
        if "users_old" not in ref_tables:
            return

        logger.warning(
            "Detected legacy FK tg_link_tokens -> users_old. Rebuilding tg_link_tokens to reference users(id)."
        )
        conn.exec_driver_sql("PRAGMA foreign_keys=OFF")
        try:
            conn.exec_driver_sql("ALTER TABLE tg_link_tokens RENAME TO tg_link_tokens__old")
            conn.exec_driver_sql(
                """
                CREATE TABLE tg_link_tokens (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    token VARCHAR(96) NOT NULL UNIQUE,
                    user_id INTEGER NOT NULL,
                    created_at DATETIME NOT NULL,
                    expires_at DATETIME NOT NULL,
                    used_at DATETIME,
                    FOREIGN KEY(user_id) REFERENCES users(id)
                );
                """
            )
            conn.exec_driver_sql(
                """
                INSERT INTO tg_link_tokens (id, token, user_id, created_at, expires_at, used_at)
                SELECT id, token, user_id, created_at, expires_at, used_at
                FROM tg_link_tokens__old;
                """
            )
            conn.exec_driver_sql("DROP TABLE tg_link_tokens__old")
        finally:
            conn.exec_driver_sql("PRAGMA foreign_keys=ON")
    # Add columns if needed
    tcols = {row[1] for row in conn.exec_driver_sql("PRAGMA table_info('tutor_profiles')").fetchall()}
    if "telegram_contact" not in tcols:
        conn.exec_driver_sql("ALTER TABLE tutor_profiles ADD COLUMN telegram_contact VARCHAR(128)")
    # VK profile/contact (optional)
    if "vk_contact" not in tcols:
        conn.exec_driver_sql("ALTER TABLE tutor_profiles ADD COLUMN vk_contact VARCHAR(255)")

    ucols = {row[1] for row in conn.exec_driver_sql("PRAGMA table_info('users')").fetchall()}
    if "tg_chat_id" not in ucols:
        conn.exec_driver_sql("ALTER TABLE users ADD COLUMN tg_chat_id INTEGER")
    if "tg_notify_enabled" not in ucols:
        conn.exec_driver_sql("ALTER TABLE users ADD COLUMN tg_notify_enabled INTEGER NOT NULL DEFAULT 0")

    ncols = {row[1] for row in conn.exec_driver_sql("PRAGMA table_info('notifications')").fetchall()}
    if "telegram_sent_at" not in ncols:
        conn.exec_driver_sql("ALTER TABLE notifications ADD COLUMN telegram_sent_at DATETIME")

    # Requests: admin hide flag (for user_id=1)
    rcols = {row[1] for row in conn.exec_driver_sql("PRAGMA table_info('requests')").fetchall()}
    if "admin_hidden" not in rcols:
        conn.exec_driver_sql("ALTER TABLE requests ADD COLUMN admin_hidden INTEGER NOT NULL DEFAULT 0")

    # Tokens table for linking Telegram bot (old MVP feature)
    conn.exec_driver_sql(
        """
        CREATE TABLE IF NOT EXISTS tg_link_tokens (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            token VARCHAR(96) NOT NULL UNIQUE,
            user_id INTEGER NOT NULL,
            created_at DATETIME NOT NULL,
            expires_at DATETIME NOT NULL,
            used_at DATETIME,
            FOREIGN KEY(user_id) REFERENCES users(id)
        );
        """
    )

    # After ensuring the table exists, fix legacy FK if needed.
    _ensure_tg_link_tokens_fk_users(conn)

    # New auth tables (for email/VK/telegram identities)
    conn.exec_driver_sql(
        """
        CREATE TABLE IF NOT EXISTS auth_identities (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            provider VARCHAR(16) NOT NULL,
            provider_user_id VARCHAR(128),
            email_normalized VARCHAR(255),
            is_verified INTEGER NOT NULL DEFAULT 0,
            created_at DATETIME NOT NULL,
            UNIQUE(provider, provider_user_id),
            UNIQUE(email_normalized),
            FOREIGN KEY(user_id) REFERENCES users(id)
        );
        """
    )

    conn.exec_driver_sql(
        """
        CREATE TABLE IF NOT EXISTS email_login_codes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            email_normalized VARCHAR(255) NOT NULL,
            code_hash VARCHAR(128) NOT NULL,
            created_at DATETIME NOT NULL,
            expires_at DATETIME NOT NULL,
            attempts INTEGER NOT NULL DEFAULT 0
        );
        """
    )

    conn.exec_driver_sql(
        """
        CREATE TABLE IF NOT EXISTS vk_oauth_states (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            state VARCHAR(96) NOT NULL UNIQUE,
            code_verifier VARCHAR(128) NOT NULL,
            device_id VARCHAR(96),
            created_at DATETIME NOT NULL,
            expires_at DATETIME NOT NULL
        );
        """
    )


# Auto-create tables (MVP)
Base.metadata.create_all(bind=engine)

# Lightweight bootstrap/migrations for SQLite
try:
    with engine.begin() as conn:
        _ensure_users_telegram_nullable(conn)
        _ensure_auth_identities_users_fk(conn)
        _ensure_requests_users_fk(conn)
        _ensure_threads_fks(conn)
        _ensure_messages_fks(conn)
        _ensure_responses_fks(conn)
        _ensure_assignments_fks(conn)
        _ensure_offers_fks(conn)
        _ensure_notifications_fk(conn)
        _ensure_tutor_profiles_fk(conn)
        _bootstrap_sqlite(conn)
except Exception:
    logger.exception("Startup DB bootstrap failed")


app.include_router(auth.router)
app.include_router(me.router)
app.include_router(tutors.router)
app.include_router(requests.router)
app.include_router(responses.router)
app.include_router(assignments.router)
app.include_router(threads.router)
app.include_router(notifications.router)
app.include_router(messages.router)
app.include_router(offers.router)
app.include_router(users.router)
app.include_router(telegram_router)
