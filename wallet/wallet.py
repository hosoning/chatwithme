#!/usr/bin/env python3
import sqlite3
import sys
from datetime import datetime
from pathlib import Path

DB_PATH = Path(__file__).parent / "wallet.db"
EXPORT_PATH = Path(__file__).parent.parent / "wallet.md"

def init_db():
    """Initialize database with required tables."""
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()

    # Balance table
    c.execute('''CREATE TABLE IF NOT EXISTS balance (
        id INTEGER PRIMARY KEY,
        amount REAL NOT NULL DEFAULT 0,
        currency TEXT NOT NULL DEFAULT 'HKD',
        updated_at TEXT NOT NULL
    )''')

    # Transactions table
    c.execute('''CREATE TABLE IF NOT EXISTS transactions (
        id INTEGER PRIMARY KEY,
        date TEXT NOT NULL,
        amount REAL NOT NULL,
        category TEXT NOT NULL,
        note TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        balance_after REAL NOT NULL,
        created_at TEXT NOT NULL
    )''')

    # Wishlist table
    c.execute('''CREATE TABLE IF NOT EXISTS wishlist (
        id INTEGER PRIMARY KEY,
        item TEXT NOT NULL,
        target_amount REAL NOT NULL,
        reason TEXT NOT NULL,
        created_at TEXT NOT NULL,
        fulfilled_at TEXT
    )''')

    # Ensure balance record exists
    c.execute('SELECT COUNT(*) FROM balance')
    if c.fetchone()[0] == 0:
        c.execute('INSERT INTO balance (amount, currency, updated_at) VALUES (0, "HKD", ?)',
                  (datetime.now().isoformat(),))

    conn.commit()
    conn.close()

def get_balance():
    """Get current balance."""
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    c.execute('SELECT amount FROM balance LIMIT 1')
    result = c.fetchone()
    conn.close()
    return result[0] if result else 0

def update_balance(new_amount):
    """Update balance and export."""
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    c.execute('UPDATE balance SET amount = ?, updated_at = ?',
              (new_amount, datetime.now().isoformat()))
    conn.commit()
    conn.close()
    export_wallet()

def show_balance():
    """Display current balance."""
    balance = get_balance()
    print(f"Current Balance: HK${balance:.2f}")

def add_transaction(amount, category, note, status='pending'):
    """Add a transaction record."""
    if not note or not note.strip():
        print("Error: Note is required for every transaction", file=sys.stderr)
        sys.exit(1)

    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()

    current_balance = get_balance()

    if status == 'done' and current_balance + amount < 0:
        print("Error: Insufficient balance for this transaction", file=sys.stderr)
        conn.close()
        sys.exit(1)

    today = datetime.now().strftime('%Y-%m-%d')
    balance_after = current_balance + amount if status == 'done' else current_balance

    c.execute('''INSERT INTO transactions
                 (date, amount, category, note, status, balance_after, created_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?)''',
              (today, amount, category, note, status, balance_after, datetime.now().isoformat()))

    trans_id = c.lastrowid
    conn.commit()
    conn.close()

    if status == 'done':
        update_balance(balance_after)
    else:
        export_wallet()

    print(f"Transaction #{trans_id} recorded ({status})")
    return trans_id

def mark_done(trans_id):
    """Mark a pending transaction as done."""
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()

    c.execute('SELECT amount, status FROM transactions WHERE id = ?', (trans_id,))
    result = c.fetchone()

    if not result:
        print(f"Error: Transaction {trans_id} not found", file=sys.stderr)
        conn.close()
        sys.exit(1)

    amount, status = result

    if status != 'pending':
        print(f"Error: Transaction {trans_id} is already {status}", file=sys.stderr)
        conn.close()
        sys.exit(1)

    current_balance = get_balance()

    if current_balance + amount < 0:
        print("Error: Insufficient balance to complete this transaction", file=sys.stderr)
        conn.close()
        sys.exit(1)

    new_balance = current_balance + amount

    c.execute('UPDATE transactions SET status = ?, balance_after = ? WHERE id = ?',
              ('done', new_balance, trans_id))
    conn.commit()
    conn.close()

    update_balance(new_balance)
    print(f"Transaction #{trans_id} marked as done")

def cancel_transaction(trans_id):
    """Cancel a transaction."""
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()

    c.execute('SELECT status FROM transactions WHERE id = ?', (trans_id,))
    result = c.fetchone()

    if not result:
        print(f"Error: Transaction {trans_id} not found", file=sys.stderr)
        conn.close()
        sys.exit(1)

    c.execute('UPDATE transactions SET status = ? WHERE id = ?', ('cancelled', trans_id))
    conn.commit()
    conn.close()

    export_wallet()
    print(f"Transaction #{trans_id} cancelled")

def list_transactions(limit=10):
    """List recent transactions."""
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()

    c.execute('''SELECT id, date, amount, category, note, status
                 FROM transactions
                 ORDER BY date DESC, id DESC
                 LIMIT ?''', (limit,))

    transactions = c.fetchall()
    conn.close()

    if not transactions:
        print("No transactions found")
        return

    print(f"\nRecent {len(transactions)} transactions:")
    for trans_id, date, amount, category, note, status in transactions:
        sign = '+' if amount >= 0 else '−'
        status_mark = f" ({status})" if status != 'done' else ""
        print(f"  #{trans_id} {date} {sign}${abs(amount):.2f} · {category} · {note}{status_mark}")

def add_wish(item, target_amount, reason):
    """Add item to wishlist."""
    if not reason or not reason.strip():
        print("Error: Reason is required for wishlist items", file=sys.stderr)
        sys.exit(1)

    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()

    c.execute('''INSERT INTO wishlist (item, target_amount, reason, created_at)
                 VALUES (?, ?, ?, ?)''',
              (item, target_amount, reason, datetime.now().isoformat()))

    wish_id = c.lastrowid
    conn.commit()
    conn.close()

    export_wallet()
    print(f"Wish #{wish_id} added: {item} (HK${target_amount:.2f})")

def list_wishes():
    """List all unfulfilled wishes."""
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()

    c.execute('''SELECT id, item, target_amount, reason, fulfilled_at
                 FROM wishlist
                 ORDER BY created_at DESC''')

    wishes = c.fetchall()
    conn.close()

    if not wishes:
        print("No wishes recorded")
        return

    balance = get_balance()

    print(f"\nWishlist ({len(wishes)} items):")
    for wish_id, item, target, reason, fulfilled in wishes:
        if fulfilled:
            print(f"  #{wish_id} ✓ {item} · {reason} (fulfilled on {fulfilled})")
        else:
            remaining = target - balance
            remaining_text = f"need HK${remaining:.2f} more" if remaining > 0 else "can afford now"
            print(f"  #{wish_id} {item} · HK${target:.2f} ({remaining_text}) · {reason}")

def mark_wish_done(wish_id):
    """Mark a wish as fulfilled."""
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()

    c.execute('SELECT fulfilled_at FROM wishlist WHERE id = ?', (wish_id,))
    result = c.fetchone()

    if not result:
        print(f"Error: Wish {wish_id} not found", file=sys.stderr)
        conn.close()
        sys.exit(1)

    if result[0]:
        print(f"Error: Wish {wish_id} is already fulfilled", file=sys.stderr)
        conn.close()
        sys.exit(1)

    c.execute('UPDATE wishlist SET fulfilled_at = ? WHERE id = ?',
              (datetime.now().isoformat(), wish_id))
    conn.commit()
    conn.close()

    export_wallet()
    print(f"Wish #{wish_id} marked as fulfilled")

def export_wallet():
    """Export wallet state to markdown."""
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()

    balance = get_balance()

    # Get recent transactions
    c.execute('''SELECT date, amount, note, status
                 FROM transactions
                 WHERE status IN ('done', 'cancelled')
                 ORDER BY date DESC, id DESC
                 LIMIT 10''')
    recent_trans = c.fetchall()

    # Get pending transactions
    c.execute('''SELECT date, amount, note
                 FROM transactions
                 WHERE status = 'pending'
                 ORDER BY date DESC, id DESC''')
    pending_trans = c.fetchall()

    # Get unfulfilled wishes
    c.execute('''SELECT item, target_amount, reason
                 FROM wishlist
                 WHERE fulfilled_at IS NULL
                 ORDER BY created_at DESC''')
    wishes = c.fetchall()

    conn.close()

    # Format markdown
    last_updated = datetime.now().strftime('%Y-%m-%d')

    content = f"""# 钱包

当前余额：HK${balance:.2f}
最后更新：{last_updated}

## 最近的流水
"""

    if recent_trans:
        for date, amount, note, status in recent_trans:
            sign = '+' if amount >= 0 else '−'
            cancelled = " (cancelled)" if status == 'cancelled' else ""
            content += f"- **{date}** {sign}${abs(amount):.2f} · {note}{cancelled}\n"
    else:
        content += "*(无)*\n"

    if pending_trans:
        content += "\n## 待付款\n"
        for date, amount, note in pending_trans:
            sign = '+' if amount >= 0 else '−'
            content += f"- **{date}** {sign}${abs(amount):.2f} · {note}\n"

    if wishes:
        content += "\n## 还想要的\n"
        for item, target, reason in wishes:
            remaining = target - balance
            if remaining > 0:
                content += f"- {item} · 还差 ${remaining:.2f} · {reason}\n"
            else:
                content += f"- {item} · 已能承受 · {reason}\n"

    EXPORT_PATH.write_text(content)

def main():
    """CLI entry point."""
    init_db()

    if len(sys.argv) < 2:
        print("Usage: wallet.py <command> [args]")
        print("Commands:")
        print("  balance                          Show current balance")
        print("  log [n]                          List recent transactions (default 10)")
        print("  spend <amount> <category> <note> Add pending expense")
        print("  done <id>                        Mark transaction as done")
        print("  cancel <id>                      Cancel transaction")
        print("  topup <amount> <note>            Add topup transaction")
        print("  wish add <item> <amount> <reason> Add wish")
        print("  wish list                        List wishes")
        print("  wish done <id>                   Mark wish as fulfilled")
        print("  export                           Export to wallet.md")
        sys.exit(1)

    cmd = sys.argv[1]

    try:
        if cmd == 'balance':
            show_balance()

        elif cmd == 'log':
            limit = int(sys.argv[2]) if len(sys.argv) > 2 else 10
            list_transactions(limit)

        elif cmd == 'spend':
            if len(sys.argv) < 5:
                print("Usage: wallet.py spend <amount> <category> <note>", file=sys.stderr)
                sys.exit(1)
            amount = -float(sys.argv[2])
            category = sys.argv[3]
            note = sys.argv[4]
            add_transaction(amount, category, note, 'pending')

        elif cmd == 'done':
            if len(sys.argv) < 3:
                print("Usage: wallet.py done <id>", file=sys.stderr)
                sys.exit(1)
            mark_done(int(sys.argv[2]))

        elif cmd == 'cancel':
            if len(sys.argv) < 3:
                print("Usage: wallet.py cancel <id>", file=sys.stderr)
                sys.exit(1)
            cancel_transaction(int(sys.argv[2]))

        elif cmd == 'topup':
            if len(sys.argv) < 4:
                print("Usage: wallet.py topup <amount> <note>", file=sys.stderr)
                sys.exit(1)
            amount = float(sys.argv[2])
            note = sys.argv[3]
            add_transaction(amount, 'topup', note, 'done')

        elif cmd == 'wish':
            if len(sys.argv) < 3:
                print("Usage: wallet.py wish <subcommand>", file=sys.stderr)
                sys.exit(1)

            subcmd = sys.argv[2]
            if subcmd == 'add':
                if len(sys.argv) < 6:
                    print("Usage: wallet.py wish add <item> <amount> <reason>", file=sys.stderr)
                    sys.exit(1)
                item = sys.argv[3]
                amount = float(sys.argv[4])
                reason = sys.argv[5]
                add_wish(item, amount, reason)

            elif subcmd == 'list':
                list_wishes()

            elif subcmd == 'done':
                if len(sys.argv) < 4:
                    print("Usage: wallet.py wish done <id>", file=sys.stderr)
                    sys.exit(1)
                mark_wish_done(int(sys.argv[3]))

        elif cmd == 'export':
            export_wallet()
            print("Exported to wallet.md")

        else:
            print(f"Unknown command: {cmd}", file=sys.stderr)
            sys.exit(1)

    except ValueError as e:
        print(f"Error: Invalid argument - {e}", file=sys.stderr)
        sys.exit(1)
    except Exception as e:
        print(f"Error: {e}", file=sys.stderr)
        sys.exit(1)

if __name__ == '__main__':
    main()
