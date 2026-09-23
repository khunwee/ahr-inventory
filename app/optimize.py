"""Optimization & deep analysis over the inventory data.

Solver chain (auto-fallback, transparent — the result reports which ran):
    1. MiniZinc CLI  (if installed / MINIZINC_PATH set)  — true CP/ILP
    2. PuLP + CBC (ILP)                                   — bundled, offline
    3. Greedy heuristic                                   — always works

Modes: max_coverage, machine_protect, fair, min_cost_safe, abc, minmax
"""
import shutil
import subprocess
import tempfile
import os
import re
import statistics
from collections import defaultdict
from datetime import datetime
from sqlalchemy import select
from .db import SessionLocal, urgency_of
from .config import settings
from .models import Item, StockTxn

WEIGHT = {"critical": 3, "high": 2, "watch": 1}
URG_TH = {"critical": "ด่วนมาก", "high": "ใกล้หมด", "watch": "เฝ้าระวัง"}


def mzn_bin():
    if settings.MINIZINC_PATH and os.path.exists(settings.MINIZINC_PATH):
        return settings.MINIZINC_PATH
    return shutil.which("minizinc")


def solver_status():
    return {"minizinc": bool(mzn_bin()), "pulp": _pulp_ok(), "greedy": True}


def _pulp_ok():
    try:
        import pulp  # noqa
        return True
    except Exception:
        return False


def _run_mzn(model, dzn, n_out):
    b = mzn_bin()
    if not b:
        raise RuntimeError("minizinc not available")
    with tempfile.TemporaryDirectory() as d:
        mp, dp = os.path.join(d, "m.mzn"), os.path.join(d, "d.dzn")
        open(mp, "w").write(model); open(dp, "w").write(dzn)
        r = subprocess.run([b, "--solver", "gecode", "--time-limit", "20000", mp, dp],
                           capture_output=True, text=True, timeout=40)
        if r.returncode != 0:
            raise RuntimeError((r.stderr or "mzn error")[:200])
        line = r.stdout.split("----------")[0]
        nums = re.findall(r"-?\d+", line)
        if len(nums) < n_out:
            raise RuntimeError("mzn: no solution")
        return [int(x) for x in nums[:n_out]]


def _candidates(only_flagged=True):
    with SessionLocal() as s:
        items = s.exec(select(Item)).all()
        out = []
        for it in items:
            urg = urgency_of(it)
            if only_flagged and not urg:
                continue
            target = it.max_level or (it.reorder_point or 0) * 2
            need = round((target or 0) - (it.on_hand or 0), 2)
            if need <= 0:
                need = max(round((it.reorder_point or 1) - (it.on_hand or 0), 2), 1)
            out.append({"id": it.id, "item_code": it.item_code,
                        "description": (it.part_name or it.description or "")[:40],
                        "category": it.category or "?", "machine": (it.machine_group or "?").strip() or "?",
                        "need": int(max(1, round(need))), "price": float(it.unit_price or 0),
                        "urgency": urg or "watch", "weight": WEIGHT.get(urg, 1)})
        return out


def _c(n):
    if n is None:
        return "-"
    a = abs(n)
    if a >= 1e6:
        return f"{n/1e6:.2f}M"
    if a >= 1e3:
        return f"{n/1e3:.1f}K"
    return f"{n:,.0f}"


# ============================ solver builders =============================
def _solve_max_coverage(cands, budget):
    cents = [int(round(c["price"] * 100)) for c in cands]
    bcents = int(round(budget * 100))

    def mzn():
        n = len(cands)
        model = ("int: n; array[1..n] of int: need; array[1..n] of int: p;\n"
                 "array[1..n] of int: w; int: B;\n"
                 "array[1..n] of var 0..1000000: q;\n"
                 "constraint forall(i in 1..n)(q[i] <= need[i]);\n"
                 "constraint sum(i in 1..n)(p[i]*q[i]) <= B;\n"
                 "solve maximize sum(i in 1..n)(w[i]*q[i]);\n"
                 "output [show(q[i]) ++ \" \" | i in 1..n];\n")
        dzn = f"n={n};\nneed={[c['need'] for c in cands]};\np={cents};\nw={[c['weight'] for c in cands]};\nB={bcents};\n"
        vals = _run_mzn(model, dzn, n)
        return {cands[i]["id"]: float(vals[i]) for i in range(n)}, "minizinc"

    def pulp():
        import pulp as P
        m = P.LpProblem("cov", P.LpMaximize)
        q = {c["id"]: P.LpVariable(f"q{c['id']}", 0, c["need"], "Integer") for c in cands}
        m += P.lpSum(c["weight"] * q[c["id"]] for c in cands)
        m += P.lpSum(cents[i] * q[cands[i]["id"]] for i in range(len(cands))) <= bcents
        m.solve(P.PULP_CBC_CMD(msg=0))
        return {c["id"]: float(q[c["id"]].value() or 0) for c in cands}, "pulp-cbc"

    def greedy():
        chosen = {c["id"]: 0.0 for c in cands}; spent = 0.0
        for c in [x for x in cands if x["price"] <= 0]:
            chosen[c["id"]] = c["need"]
        for c in sorted([x for x in cands if x["price"] > 0], key=lambda c: -(c["weight"] / c["price"])):
            if spent >= budget:
                break
            qn = min(c["need"], int((budget - spent) // c["price"]))
            if qn > 0:
                chosen[c["id"]] = float(qn); spent += qn * c["price"]
        return chosen, "greedy"

    return _try([mzn, pulp, greedy], cands)


def _solve_group(cands, budget, mode):
    """machine_protect and fair both work on binary 'stock this item fully'."""
    groups = defaultdict(list)
    for c in cands:
        groups[c["machine"]].append(c)
    gkeys = list(groups.keys())
    gidx = {g: i for i, g in enumerate(gkeys)}
    icost = [int(round(c["need"] * c["price"] * 100)) for c in cands]
    bcents = int(round(budget * 100))
    grp = [gidx[c["machine"]] + 1 for c in cands]
    size = [len(groups[g]) for g in gkeys]

    def mzn():
        n = len(cands); g = len(gkeys)
        if mode == "machine_protect":
            model = ("int: n; int: g; array[1..n] of int: grp; array[1..n] of int: cost; int: B;\n"
                     "array[1..n] of var 0..1: x; array[1..g] of var 0..1: y;\n"
                     "constraint forall(i in 1..n)(y[grp[i]] <= x[i]);\n"
                     "constraint sum(i in 1..n)(cost[i]*x[i]) <= B;\n"
                     "solve maximize sum(k in 1..g)(y[k]);\n"
                     "output [show(x[i]) ++ \" \" | i in 1..n];\n")
            dzn = f"n={n};\ng={g};\ngrp={grp};\ncost={icost};\nB={bcents};\n"
        else:  # fair
            model = ("int: n; int: g; array[1..n] of int: grp; array[1..n] of int: cost;\n"
                     "array[1..g] of int: sz; int: B;\n"
                     "array[1..n] of var 0..1: x; var 0..100: z;\n"
                     "constraint forall(k in 1..g)(z*sz[k] <= 100*sum(i in 1..n)(bool2int(grp[i]==k)*x[i]));\n"
                     "constraint sum(i in 1..n)(cost[i]*x[i]) <= B;\n"
                     "solve maximize z;\n"
                     "output [show(x[i]) ++ \" \" | i in 1..n];\n")
            dzn = f"n={n};\ng={g};\ngrp={grp};\ncost={icost};\nsz={size};\nB={bcents};\n"
        vals = _run_mzn(model, dzn, n)
        return {cands[i]["id"]: (float(cands[i]["need"]) if vals[i] > 0 else 0.0) for i in range(n)}, "minizinc"

    def pulp():
        import pulp as P
        m = P.LpProblem(mode, P.LpMaximize)
        x = {c["id"]: P.LpVariable(f"x{c['id']}", cat="Binary") for c in cands}
        if mode == "machine_protect":
            y = {g: P.LpVariable(f"y{i}", cat="Binary") for i, g in enumerate(gkeys)}
            m += P.lpSum(y.values())
            for g, items in groups.items():
                for c in items:
                    m += y[g] <= x[c["id"]]
        else:
            z = P.LpVariable("z", 0, 1)
            m += z
            for g, items in groups.items():
                m += z <= P.lpSum(x[c["id"]] for c in items) / len(items)
        m += P.lpSum(icost[i] * x[cands[i]["id"]] for i in range(len(cands))) <= bcents
        m.solve(P.PULP_CBC_CMD(msg=0))
        return {c["id"]: (float(c["need"]) if (x[c["id"]].value() or 0) > 0.5 else 0.0) for c in cands}, "pulp-cbc"

    def greedy():
        chosen = {c["id"]: 0.0 for c in cands}; spent = 0.0
        gcost = {g: sum(x["need"] * x["price"] for x in items) for g, items in groups.items()}
        for g in sorted(groups, key=lambda g: gcost[g]):
            if spent + gcost[g] <= budget:
                for c in groups[g]:
                    chosen[c["id"]] = c["need"]
                spent += gcost[g]
        return chosen, "greedy"

    return _try([mzn, pulp, greedy], cands)


def _try(solvers, cands):
    for fn in solvers:
        try:
            return fn()
        except Exception:
            continue
    return {c["id"]: 0.0 for c in cands}, "none"


# =============================== assembly =================================
def _assemble(cands, chosen, method, budget, mode, extra_kpis=None, coverage_chart=None):
    rows, spent, by_cat = [], 0.0, defaultdict(float)
    for c in cands:
        q = chosen.get(c["id"], 0.0)
        if q <= 0:
            continue
        cost = q * c["price"]; spent += cost; by_cat[c["category"]] += cost
        rows.append({"id": c["id"], "item_code": c["item_code"], "description": c["description"],
                     "category": c["category"], "machine": c["machine"], "urgency": c["urgency"],
                     "need": c["need"], "order_qty": q, "unit_price": c["price"],
                     "cost": round(cost, 2), "fully_funded": q >= c["need"]})
    rows.sort(key=lambda r: ({"critical": 0, "high": 1, "watch": 2}.get(r["urgency"], 9), -r["cost"]))
    total_need = sum(c["need"] * c["price"] for c in cands)
    solver_name = {"minizinc": "MiniZinc", "pulp-cbc": "PuLP/CBC (ILP)", "greedy": "Greedy",
                   "full-plan": "แผนเต็ม", "none": "-"}.get(method, method)
    kpis = [{"label": "ตัวแก้ปัญหาที่ใช้", "value": solver_name, "foot": "SOLVER"},
            {"label": "ใช้งบ", "value": "฿" + _c(spent), "foot": ("จาก ฿" + _c(budget)) if budget else "NO LIMIT"},
            {"label": "อะไหล่ที่สั่ง", "value": len(rows), "foot": str(len(cands)) + " รายการที่พิจารณา"}]
    if extra_kpis:
        kpis = extra_kpis + kpis
    return {"mode": mode, "method": method, "budget": round(budget, 2) if budget else None,
            "spent": round(spent, 2), "total_need_cost": round(total_need, 2),
            "remaining": round(budget - spent, 2) if budget else None, "candidates": len(cands),
            "items_ordered": len(rows), "kpis": kpis, "coverage_chart": coverage_chart,
            "by_category": {k: round(v, 0) for k, v in by_cat.items()}, "rows": rows}


# =============================== public API ==============================
def optimize(mode="max_coverage", budget=None, only_flagged=True):
    if mode == "abc":
        return _abc()
    if mode == "minmax":
        return _minmax()
    cands = _candidates(only_flagged)
    if not cands:
        return {"mode": mode, "method": "none", "rows": [], "kpis": [], "items_ordered": 0,
                "by_category": {}, "budget": budget, "spent": 0, "candidates": 0, "coverage_chart": None}

    if mode == "min_cost_safe":
        chosen = {c["id"]: c["need"] for c in cands}
        by_urg = defaultdict(float)
        for c in cands:
            by_urg[c["urgency"]] += c["need"] * c["price"]
        kpis = [{"label": "งบขั้นต่ำให้ปลอดภัย", "value": "฿" + _c(sum(by_urg.values())), "foot": "MIN SAFE BUDGET"},
                {"label": "ของด่วนมาก", "value": "฿" + _c(by_urg.get("critical", 0)), "foot": "CRITICAL"}]
        return _assemble(cands, chosen, "full-plan", None, mode, extra_kpis=kpis)

    total_need = sum(c["need"] * c["price"] for c in cands)
    no_limit = budget is None or budget <= 0
    b = total_need if no_limit else float(budget)

    if mode in ("machine_protect", "fair"):
        if no_limit:
            chosen, method = {c["id"]: c["need"] for c in cands}, "full-plan"
        else:
            chosen, method = _solve_group(cands, b, mode)
        groups = defaultdict(list)
        for c in cands:
            groups[c["machine"]].append(c)
        cov = {"labels": [], "ordered": [], "needed": []}
        for g, items in sorted(groups.items(), key=lambda kv: -len(kv[1]))[:12]:
            cov["labels"].append(g[:16])
            cov["ordered"].append(sum(1 for c in items if chosen.get(c["id"], 0) >= c["need"]))
            cov["needed"].append(len(items))
        if mode == "machine_protect":
            protected = sum(1 for items in groups.values()
                            if all(chosen.get(c["id"], 0) >= c["need"] for c in items))
            kpis = [{"label": "เครื่องที่ป้องกันได้ครบ", "value": f"{protected}/{len(groups)}", "foot": "MACHINES PROTECTED"}]
            title = "อะไหล่พร้อมต่อเครื่อง (สั่ง/ทั้งหมด)"
        else:
            min_cov = min((sum(1 for c in items if chosen.get(c["id"], 0) >= c["need"]) / len(items)
                           for items in groups.values()), default=0)
            kpis = [{"label": "ความครอบคลุมต่ำสุด/เครื่อง", "value": f"{min_cov*100:.0f}%", "foot": "WORST-CASE"}]
            title = "ความครอบคลุมรายเครื่อง (สั่ง/ทั้งหมด)"
        return _assemble(cands, chosen, method, None if no_limit else b, mode,
                         extra_kpis=kpis, coverage_chart={"title": title, **cov})

    # default: max_coverage
    if no_limit:
        chosen, method = {c["id"]: c["need"] for c in cands}, "full-plan"
    else:
        chosen, method = _solve_max_coverage(cands, b)
    byurg = defaultdict(lambda: [0.0, 0.0])
    for c in cands:
        byurg[c["urgency"]][0] += chosen.get(c["id"], 0); byurg[c["urgency"]][1] += c["need"]
    cov = {"labels": [], "ordered": [], "needed": []}
    for u in ["critical", "high", "watch"]:
        if u in byurg:
            cov["labels"].append(URG_TH[u]); cov["ordered"].append(round(byurg[u][0], 1)); cov["needed"].append(round(byurg[u][1], 1))
    funded = sum(1 for c in cands if chosen.get(c["id"], 0) >= c["need"])
    kpis = [{"label": "มูลค่าที่ต้องสั่งทั้งหมด", "value": "฿" + _c(total_need), "foot": "REQUIRED"},
            {"label": "ครอบคลุมครบ", "value": funded, "foot": "FULLY FUNDED"}]
    return _assemble(cands, chosen, method, None if no_limit else b, mode,
                     extra_kpis=kpis, coverage_chart={"title": "ความครอบคลุมตามความเร่งด่วน (หน่วย)", **cov})


def _consumption_stats(days=180):
    """Per-item monthly issue quantities from the ledger."""
    with SessionLocal() as s:
        txns = s.exec(select(StockTxn).where(StockTxn.txn_type == "issue")).all()
    per = defaultdict(list)
    for t in txns:
        per[t.item_id].append(t.qty)
    return per


def _minmax():
    """Recommend reorder point & max level per item from usage + lead time.
    ROP = avg monthly demand * lead time + safety stock; Max = ROP + one cycle."""
    per = _consumption_stats()
    with SessionLocal() as s:
        items = s.exec(select(Item)).all()
        rows = []
        changed = 0
        for it in items:
            hist = per.get(it.id, [])
            monthly = (sum(hist) / max(len(hist), 1)) if hist else 0.0
            # fallback demand proxy when no history: current reorder point
            demand = monthly if monthly > 0 else (it.reorder_point or 0)
            lead = it.lead_time_months or 2
            sigma = statistics.pstdev(hist) if len(hist) > 1 else demand * 0.5
            safety = round(1.65 * sigma * (lead ** 0.5), 1)          # ~95% service level
            rop = round(demand * lead + safety, 1)
            mx = round(rop + max(demand, 1), 1)
            if abs((it.reorder_point or 0) - rop) > 0.5 or abs((it.max_level or 0) - mx) > 0.5:
                changed += 1
            rows.append({"id": it.id, "item_code": it.item_code,
                         "description": (it.part_name or it.description or "")[:40],
                         "category": it.category or "?", "machine": it.machine_group or "?",
                         "urgency": urgency_of(it) or "ok", "on_hand": it.on_hand or 0,
                         "cur_min": it.min_level or 0, "cur_rop": it.reorder_point or 0,
                         "cur_max": it.max_level or 0, "rec_rop": rop, "rec_max": mx,
                         "monthly_use": round(demand, 1), "lead": lead,
                         # reuse generic fields so the table renderer works
                         "need": rop, "order_qty": mx, "unit_price": it.unit_price or 0, "cost": 0,
                         "fully_funded": True})
        rows.sort(key=lambda r: -(r["monthly_use"]))
        n_hist = sum(1 for it in items if per.get(it.id))
        kpis = [{"label": "อะไหล่ที่แนะนำให้ปรับ", "value": changed, "foot": "TO ADJUST"},
                {"label": "มีประวัติการใช้จริง", "value": n_hist, "foot": "WITH USAGE DATA"},
                {"label": "วิธีคำนวณ", "value": "ROP=ใช้/เดือน×lead+safety", "foot": "SERVICE 95%"}]
        return {"mode": "minmax", "method": "analysis", "budget": None, "spent": 0,
                "total_need_cost": 0, "remaining": None, "candidates": len(items),
                "items_ordered": len(rows), "kpis": kpis, "coverage_chart": None,
                "by_category": {}, "rows": rows[:300], "is_minmax": True}


def apply_minmax():
    """Write recommended reorder_point / max_level back to items."""
    res = _minmax()
    n = 0
    with SessionLocal() as s:
        for r in res["rows"]:
            it = s.get(Item, r["id"])
            if not it:
                continue
            it.reorder_point = r["rec_rop"]; it.max_level = r["rec_max"]
            it.updated_at = datetime.utcnow(); s.add(it); n += 1
        s.commit()
    return {"ok": True, "updated": n}


def _abc():
    with SessionLocal() as s:
        items = s.exec(select(Item)).all()
    ranked = sorted(items, key=lambda it: -((it.on_hand or 0) * (it.unit_price or 0)))
    total = sum((it.on_hand or 0) * (it.unit_price or 0) for it in ranked) or 1
    cum = 0.0; rows = []; band = {"A": [0, 0.0], "B": [0, 0.0], "C": [0, 0.0]}
    for it in ranked:
        val = (it.on_hand or 0) * (it.unit_price or 0)
        cum += val; share = cum / total
        cls = "A" if share <= 0.8 else ("B" if share <= 0.95 else "C")
        band[cls][0] += 1; band[cls][1] += val
        if len(rows) < 200:
            rows.append({"id": it.id, "item_code": it.item_code,
                         "description": (it.part_name or it.description or "")[:40],
                         "category": it.category or "?", "machine": it.machine_group or "?",
                         "urgency": cls, "need": 0, "order_qty": 0,
                         "on_hand": it.on_hand or 0, "unit_price": it.unit_price or 0,
                         "cost": round(val, 2), "fully_funded": True})
    kpis = [{"label": "กลุ่ม A (มูลค่าสูงสุด ~80%)", "value": f"{band['A'][0]} รายการ", "foot": "฿" + _c(band['A'][1])},
            {"label": "กลุ่ม B (~15%)", "value": f"{band['B'][0]} รายการ", "foot": "฿" + _c(band['B'][1])},
            {"label": "กลุ่ม C (~5%)", "value": f"{band['C'][0]} รายการ", "foot": "฿" + _c(band['C'][1])}]
    return {"mode": "abc", "method": "analysis", "budget": None, "spent": 0,
            "total_need_cost": round(total, 2), "remaining": None, "candidates": len(ranked),
            "items_ordered": len(rows), "kpis": kpis, "is_abc": True,
            "coverage_chart": {"title": "จำนวนรายการตามกลุ่ม ABC", "labels": ["A", "B", "C"],
                               "ordered": [band["A"][0], band["B"][0], band["C"][0]],
                               "needed": [band["A"][0], band["B"][0], band["C"][0]]},
            "by_category": {"A": round(band["A"][1], 0), "B": round(band["B"][1], 0), "C": round(band["C"][1], 0)},
            "rows": rows}


def optimize_reorder(budget=None, only_flagged=True):
    return optimize("max_coverage", budget, only_flagged)
