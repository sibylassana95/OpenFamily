import { Router } from 'express';
import { query } from '../db';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import logger from '../lib/logger';

const router = Router();
router.use(authMiddleware);

// =============================================================================
// GET /api/dashboard
//
// Returns the headline metrics for the home screen. Two layers of data:
//
//   - top-level counters (upcomingAppointments, pendingTasks, …) — kept for
//     backward compatibility with anything that still reads them
//   - `kpis` — the richer "Aperçu rapide" payload (PR #30) used by the new
//     KPI grid in client/src/pages/Dashboard.tsx. Each field is self-contained
//     so the UI can render any subset without further requests.
// =============================================================================

interface KpiPayload {
    // Budget trend: this month vs same window last month.
    budget: {
        thisMonth: number;
        lastMonth: number;
        // +1.0 = doubled; -0.5 = halved; null when last month was 0 (no baseline).
        deltaRatio: number | null;
        topCategory: { category: string; amount: number } | null;
    };
    // Shopping list completion.
    shopping: {
        total: number;
        checked: number;
        pending: number;
    };
    // How many days of the current week (Mon..Sun) have at least one planned meal.
    mealPlanning: {
        plannedDays: number;
        totalDays: number; // always 7
    };
    // Next upcoming appointment in the user's calendar (any horizon).
    nextAppointment: { id: string; title: string; startTime: string } | null;
    // Tasks that should have been done by now and aren't.
    overdueTasks: number;
}

router.get('/', async (req: AuthRequest, res) => {
    try {
        const userId = req.userId;

        // --- Top-level counters (legacy contract) ---------------------------
        const [
            appointmentsResult,
            tasksResult,
            shoppingResult,
            budgetResult,
            alertsResult,
            // --- New KPIs ---
            lastMonthExpensesResult,
            topCategoryResult,
            shoppingTotalResult,
            mealPlanningResult,
            nextApptResult,
            overdueTasksResult,
        ] = await Promise.all([
            // Legacy: appointments in the next 7 days.
            query(
                `SELECT COUNT(*) as count FROM appointments
                 WHERE user_id = $1
                   AND start_time >= NOW()
                   AND start_time <= NOW() + INTERVAL '7 days'`,
                [userId],
            ),
            query(
                `SELECT COUNT(*) as count FROM tasks
                 WHERE user_id = $1 AND is_completed = false`,
                [userId],
            ),
            query(
                `SELECT COUNT(*) as count FROM shopping_items
                 WHERE user_id = $1 AND is_checked = false`,
                [userId],
            ),
            query(
                `SELECT COALESCE(SUM(amount), 0) as total FROM budget_entries
                 WHERE user_id = $1 AND is_expense = true
                   AND date_trunc('month', date) = date_trunc('month', NOW())`,
                [userId],
            ),
            query(
                `SELECT COUNT(*) as count
                 FROM (
                     SELECT be.category
                     FROM budget_entries be
                     JOIN budget_limits bl ON be.category = bl.category
                       AND bl.user_id = be.user_id
                       AND bl.month = EXTRACT(MONTH FROM be.date)
                       AND bl.year = EXTRACT(YEAR FROM be.date)
                     WHERE be.user_id = $1
                       AND be.is_expense = true
                       AND date_trunc('month', be.date) = date_trunc('month', NOW())
                     GROUP BY be.category, bl.monthly_limit
                     HAVING SUM(be.amount) > bl.monthly_limit
                 ) alert_categories`,
                [userId],
            ),

            // KPI: last month's total expenses (same period truncation).
            query(
                `SELECT COALESCE(SUM(amount), 0) as total FROM budget_entries
                 WHERE user_id = $1 AND is_expense = true
                   AND date_trunc('month', date) = date_trunc('month', NOW() - INTERVAL '1 month')`,
                [userId],
            ),
            // KPI: top expense category this month.
            query(
                `SELECT category, COALESCE(SUM(amount), 0) as total FROM budget_entries
                 WHERE user_id = $1 AND is_expense = true
                   AND date_trunc('month', date) = date_trunc('month', NOW())
                 GROUP BY category
                 ORDER BY total DESC
                 LIMIT 1`,
                [userId],
            ),
            // KPI: shopping list completion (total / checked).
            query(
                `SELECT
                    COUNT(*) AS total,
                    COUNT(*) FILTER (WHERE is_checked = true) AS checked
                 FROM shopping_items
                 WHERE user_id = $1`,
                [userId],
            ),
            // KPI: distinct days of the current week (Monday-Sunday) with at
            // least one meal plan entry. We use the ISO definition of week
            // start (Monday) for consistency with the client UI.
            query(
                `SELECT COUNT(DISTINCT date) AS planned_days FROM meal_plans
                 WHERE user_id = $1
                   AND date >= date_trunc('week', NOW())::date
                   AND date <  date_trunc('week', NOW())::date + INTERVAL '7 days'`,
                [userId],
            ),
            // KPI: next appointment (any horizon).
            query(
                `SELECT id, title, start_time FROM appointments
                 WHERE user_id = $1 AND start_time >= NOW()
                 ORDER BY start_time ASC
                 LIMIT 1`,
                [userId],
            ),
            // KPI: overdue tasks (past due_date, still open).
            query(
                `SELECT COUNT(*) AS count FROM tasks
                 WHERE user_id = $1
                   AND is_completed = false
                   AND due_date IS NOT NULL
                   AND due_date < NOW()`,
                [userId],
            ),
        ]);

        const thisMonthExpenses = parseFloat(budgetResult.rows[0]?.total || '0');
        const lastMonthExpenses = parseFloat(lastMonthExpensesResult.rows[0]?.total || '0');
        const topCategoryRow = topCategoryResult.rows[0];

        const shoppingTotal = parseInt(shoppingTotalResult.rows[0]?.total || '0', 10);
        const shoppingChecked = parseInt(shoppingTotalResult.rows[0]?.checked || '0', 10);

        const next = nextApptResult.rows[0];

        const kpis: KpiPayload = {
            budget: {
                thisMonth: thisMonthExpenses,
                lastMonth: lastMonthExpenses,
                deltaRatio:
                    lastMonthExpenses > 0
                        ? (thisMonthExpenses - lastMonthExpenses) / lastMonthExpenses
                        : null,
                topCategory: topCategoryRow
                    ? {
                          category: topCategoryRow.category,
                          amount: parseFloat(topCategoryRow.total || '0'),
                      }
                    : null,
            },
            shopping: {
                total: shoppingTotal,
                checked: shoppingChecked,
                pending: shoppingTotal - shoppingChecked,
            },
            mealPlanning: {
                plannedDays: parseInt(mealPlanningResult.rows[0]?.planned_days || '0', 10),
                totalDays: 7,
            },
            nextAppointment: next
                ? {
                      id: next.id,
                      title: next.title,
                      // start_time arrives as a Date — serialize as ISO so the
                      // client doesn't have to deal with TZ guesswork.
                      startTime: new Date(next.start_time).toISOString(),
                  }
                : null,
            overdueTasks: parseInt(overdueTasksResult.rows[0]?.count || '0', 10),
        };

        res.json({
            success: true,
            data: {
                upcomingAppointments: parseInt(appointmentsResult.rows[0]?.count || '0', 10),
                pendingTasks: parseInt(tasksResult.rows[0]?.count || '0', 10),
                shoppingItems: parseInt(shoppingResult.rows[0]?.count || '0', 10),
                thisMonthExpenses,
                budgetAlerts: parseInt(alertsResult.rows[0]?.count || '0', 10),
                kpis,
            },
        });
    } catch (error) {
        logger.error('dashboard.get_dashboard_stats_failed', {
            error: error instanceof Error ? error.message : String(error),
        });
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

export default router;
