/**
 * Edge Function: /functions/v1/tasks
 *
 * Handles all CRUD operations for user_daily_tasks.
 *
 * Routes (via URL path suffix):
 *   GET    /tasks/{deviceId}/{date}   → list tasks for a date
 *   POST   /tasks                     → create one or more tasks
 *   PUT    /tasks/{taskId}            → update description / toggle completion
 *   DELETE /tasks/{taskId}            → delete a task
 */

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}

function err(message: string, status = 400) {
  return json({ success: false, error: message }, status);
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  // Parse path suffix: /functions/v1/tasks[/...rest]
  const url = new URL(req.url);
  const parts = url.pathname.replace(/^\/functions\/v1\/tasks\/?/, '').split('/').filter(Boolean);

  try {
    // ── GET /{deviceId}/{date} ────────────────────────────────────────────────
    if (req.method === 'GET') {
      const [deviceId, date] = parts;
      if (!deviceId || !date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        return err('deviceId and date (YYYY-MM-DD) are required.');
      }

      const { data, error } = await supabase
        .from('user_daily_tasks')
        .select('*')
        .eq('device_id', deviceId)
        .eq('task_date', date)
        .order('created_at', { ascending: true });

      if (error) throw error;
      return json({ success: true, tasks: data });
    }

    // ── POST / ────────────────────────────────────────────────────────────────
    if (req.method === 'POST') {
      const body = await req.json();
      const { deviceId, taskDate, tasks } = body;

      if (!deviceId || !taskDate || !Array.isArray(tasks) || tasks.length === 0) {
        return err('deviceId, taskDate, and a non-empty tasks array are required.');
      }
      if (!/^\d{4}-\d{2}-\d{2}$/.test(taskDate)) {
        return err('taskDate must be YYYY-MM-DD.');
      }

      const rows = tasks
        .filter((t: unknown) => typeof t === 'string' && (t as string).trim())
        .map((t: string) => ({
          device_id: deviceId,
          task_date: taskDate,
          task_description: t.trim(),
        }));

      if (rows.length === 0) return err('All provided task strings were empty.');

      const { data, error } = await supabase
        .from('user_daily_tasks')
        .insert(rows)
        .select();

      if (error) throw error;
      return json({ success: true, tasks: data }, 201);
    }

    // ── PUT /{taskId} ─────────────────────────────────────────────────────────
    if (req.method === 'PUT') {
      const [taskId] = parts;
      if (!taskId) return err('taskId is required in the path.');

      const body = await req.json();
      const { taskDescription, isCompleted } = body;

      if (taskDescription === undefined && isCompleted === undefined) {
        return err('Provide taskDescription and/or isCompleted.');
      }

      const updates: Record<string, unknown> = {};

      if (taskDescription !== undefined) {
        const trimmed = (taskDescription as string).trim();
        if (!trimmed) return err('taskDescription cannot be empty.');
        updates.task_description = trimmed;
      }

      if (isCompleted !== undefined) {
        const completing = isCompleted === true || isCompleted === 'true' || isCompleted === 1;
        updates.is_completed = completing;
        updates.completed_at = completing ? new Date().toISOString() : null;
      }

      const { data, error } = await supabase
        .from('user_daily_tasks')
        .update(updates)
        .eq('task_id', taskId)
        .select()
        .single();

      if (error) {
        if (error.code === 'PGRST116') return err('Task not found.', 404);
        throw error;
      }
      return json({ success: true, task: data });
    }

    // ── DELETE /{taskId} ──────────────────────────────────────────────────────
    if (req.method === 'DELETE') {
      const [taskId] = parts;
      if (!taskId) return err('taskId is required in the path.');

      const { error } = await supabase
        .from('user_daily_tasks')
        .delete()
        .eq('task_id', taskId);

      if (error) throw error;
      return json({ success: true, message: 'Task deleted.' });
    }

    return err('Method not allowed.', 405);
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Internal server error';
    console.error('[tasks]', message);
    return json({ success: false, error: message }, 500);
  }
});
