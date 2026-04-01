/**
 * Edge Function: /functions/v1/analytics
 *
 * GET /analytics/{deviceId}?days=30
 * Returns per-day task aggregates and an overall summary for a device.
 */

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'GET') return json({ success: false, error: 'Method not allowed.' }, 405);

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  const url = new URL(req.url);
  const deviceId = url.pathname.replace(/^\/functions\/v1\/analytics\/?/, '').split('/')[0];
  const days = Math.min(Math.max(parseInt(url.searchParams.get('days') ?? '30', 10), 1), 365);

  if (!deviceId) return json({ success: false, error: 'deviceId is required.' }, 400);

  try {
    // Daily aggregates using the view (falls back to raw query if view doesn't exist)
    const { data: dailyRaw, error: dailyErr } = await supabase.rpc('get_daily_analytics', {
      p_device_id: deviceId,
      p_days: days,
    });

    // If the RPC doesn't exist yet, fall back to a direct query
    let daily: unknown[];
    if (dailyErr) {
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - days);
      const cutoffStr = cutoff.toISOString().slice(0, 10);

      const { data, error } = await supabase
        .from('user_daily_tasks')
        .select('task_date, is_completed')
        .eq('device_id', deviceId)
        .gte('task_date', cutoffStr)
        .order('task_date', { ascending: true });

      if (error) throw error;

      // Aggregate in JS
      const grouped: Record<string, { total: number; completed: number }> = {};
      for (const row of (data ?? [])) {
        const d = row.task_date as string;
        if (!grouped[d]) grouped[d] = { total: 0, completed: 0 };
        grouped[d].total++;
        if (row.is_completed) grouped[d].completed++;
      }

      daily = Object.entries(grouped)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([task_date, { total, completed }]) => ({
          task_date,
          total_tasks: total,
          completed_tasks: completed,
          completion_rate_pct: total > 0 ? Math.round((completed / total) * 1000) / 10 : 0,
        }));
    } else {
      daily = dailyRaw ?? [];
    }

    // Overall summary
    const { data: allTasks, error: summaryErr } = await supabase
      .from('user_daily_tasks')
      .select('task_date, is_completed')
      .eq('device_id', deviceId);

    if (summaryErr) throw summaryErr;

    const tasks = allTasks ?? [];
    const totalTasks = tasks.length;
    const completedTasks = tasks.filter((t) => t.is_completed).length;
    const dates = [...new Set(tasks.map((t) => t.task_date as string))];

    const summary = {
      total_tasks: totalTasks,
      completed_tasks: completedTasks,
      active_days: dates.length,
      first_task_date: dates.sort()[0] ?? null,
      last_task_date: dates.sort().at(-1) ?? null,
    };

    return json({ success: true, summary, daily });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Internal server error';
    console.error('[analytics]', message);
    return json({ success: false, error: message }, 500);
  }
});
