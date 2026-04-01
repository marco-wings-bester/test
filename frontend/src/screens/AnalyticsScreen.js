import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  TouchableOpacity,
  Dimensions,
  RefreshControl,
} from 'react-native';
import { BarChart } from 'react-native-chart-kit';
import { COLORS, SPACING, RADIUS, SHADOW } from '../constants/theme';
import { getDeviceId } from '../utils/deviceId';
import { fetchAnalytics } from '../services/api';

const SCREEN_WIDTH = Dimensions.get('window').width;
const CHART_WIDTH = SCREEN_WIDTH - SPACING.md * 2;

const RANGE_OPTIONS = [
  { label: '7D', days: 7 },
  { label: '14D', days: 14 },
  { label: '30D', days: 30 },
  { label: '90D', days: 90 },
];

function StatCard({ label, value, subLabel, color }) {
  return (
    <View style={[styles.statCard, SHADOW.small]}>
      <Text style={[styles.statValue, color && { color }]}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
      {subLabel ? <Text style={styles.statSubLabel}>{subLabel}</Text> : null}
    </View>
  );
}

export default function AnalyticsScreen() {
  const [analytics, setAnalytics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedRange, setSelectedRange] = useState(30);
  const [deviceId, setDeviceId] = useState(null);

  useEffect(() => {
    (async () => {
      const id = await getDeviceId();
      setDeviceId(id);
    })();
  }, []);

  const loadAnalytics = useCallback(async () => {
    if (!deviceId) return;
    try {
      const data = await fetchAnalytics(deviceId, selectedRange);
      setAnalytics(data);
    } catch (err) {
      console.warn('Analytics load error:', err.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [deviceId, selectedRange]);

  useEffect(() => {
    if (deviceId) {
      setLoading(true);
      loadAnalytics();
    }
  }, [deviceId, selectedRange]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleRefresh = useCallback(() => {
    setRefreshing(true);
    loadAnalytics();
  }, [loadAnalytics]);

  // ─── Chart data preparation ───────────────────────────────────────────────

  const buildChartData = useCallback(() => {
    if (!analytics?.daily || analytics.daily.length === 0) return null;

    const daily = analytics.daily;
    // Show at most 14 labels to avoid crowding
    const stride = Math.max(1, Math.ceil(daily.length / 14));

    const labels = daily
      .filter((_, i) => i % stride === 0)
      .map((row) => {
        const d = new Date(row.task_date + 'T00:00:00');
        return `${d.getMonth() + 1}/${d.getDate()}`;
      });

    // Pad label array to match full dataset length (chart-kit needs equal lengths)
    const allLabels = daily.map((row, i) => {
      if (i % stride === 0) {
        const d = new Date(row.task_date + 'T00:00:00');
        return `${d.getMonth() + 1}/${d.getDate()}`;
      }
      return '';
    });

    return {
      labels: allLabels,
      datasets: [
        {
          data: daily.map((r) => Number(r.total_tasks) || 0),
          color: (opacity = 1) => `rgba(79,70,229,${opacity})`,    // primary
          strokeWidth: 2,
        },
        {
          data: daily.map((r) => Number(r.completed_tasks) || 0),
          color: (opacity = 1) => `rgba(16,185,129,${opacity})`,   // accent
          strokeWidth: 2,
        },
      ],
      legend: ['Created', 'Completed'],
    };
  }, [analytics]);

  const chartData = buildChartData();

  // ─── Derived summary stats ────────────────────────────────────────────────

  const summary = analytics?.summary || {};
  const totalTasks = Number(summary.total_tasks) || 0;
  const completedTasks = Number(summary.completed_tasks) || 0;
  const activeDays = Number(summary.active_days) || 0;
  const overallRate = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;
  const avgPerDay = activeDays > 0 ? (totalTasks / activeDays).toFixed(1) : '—';

  const streakDays = useCallback(() => {
    if (!analytics?.daily) return 0;
    const sorted = [...analytics.daily].sort((a, b) =>
      b.task_date.localeCompare(a.task_date)
    );
    let streak = 0;
    for (const row of sorted) {
      if (Number(row.total_tasks) > 0) streak++;
      else break;
    }
    return streak;
  }, [analytics]);

  // ─── Render ───────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={COLORS.primary} />}
    >
      {/* Range selector */}
      <View style={styles.rangeRow}>
        {RANGE_OPTIONS.map((opt) => (
          <TouchableOpacity
            key={opt.days}
            style={[styles.rangeBtn, selectedRange === opt.days && styles.rangeBtnActive]}
            onPress={() => setSelectedRange(opt.days)}
          >
            <Text style={[styles.rangeBtnText, selectedRange === opt.days && styles.rangeBtnTextActive]}>
              {opt.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Summary cards */}
      <View style={styles.statsGrid}>
        <StatCard label="Total Tasks" value={totalTasks} />
        <StatCard label="Completed" value={completedTasks} color={COLORS.accent} />
        <StatCard
          label="Completion Rate"
          value={`${overallRate}%`}
          color={overallRate >= 70 ? COLORS.accent : overallRate >= 40 ? COLORS.warning : COLORS.danger}
        />
        <StatCard label="Avg / Day" value={avgPerDay} />
        <StatCard label="Active Days" value={activeDays} />
        <StatCard label="Current Streak" value={`${streakDays()}d`} color={COLORS.primary} />
      </View>

      {/* Bar chart */}
      {chartData ? (
        <View style={[styles.chartCard, SHADOW.small]}>
          <Text style={styles.chartTitle}>Tasks Per Day</Text>
          <View style={styles.legend}>
            <View style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: COLORS.primary }]} />
              <Text style={styles.legendText}>Created</Text>
            </View>
            <View style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: COLORS.accent }]} />
              <Text style={styles.legendText}>Completed</Text>
            </View>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <BarChart
              data={{
                labels: chartData.labels,
                datasets: [
                  {
                    data: chartData.datasets[0].data,
                    colors: chartData.datasets[0].data.map(() => () => COLORS.primary),
                  },
                ],
              }}
              width={Math.max(CHART_WIDTH, chartData.labels.length * 28)}
              height={220}
              yAxisLabel=""
              yAxisSuffix=""
              withCustomBarColorFromData
              flatColor
              fromZero
              showBarTops={false}
              chartConfig={{
                backgroundColor: COLORS.surface,
                backgroundGradientFrom: COLORS.surface,
                backgroundGradientTo: COLORS.surface,
                decimalPlaces: 0,
                color: (opacity = 1) => `rgba(79,70,229,${opacity})`,
                labelColor: () => COLORS.textMuted,
                style: { borderRadius: RADIUS.md },
                propsForLabels: { fontSize: 10 },
              }}
              style={styles.chart}
            />
          </ScrollView>

          {/* Completed overlay as line — second dataset rendered manually */}
          <Text style={styles.chartSubtitle}>
            Completed tasks (green) are overlaid on the created total (purple).
          </Text>

          {/* Completion rate bars */}
          <Text style={styles.chartTitle}>Completion Rate (%)</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <BarChart
              data={{
                labels: chartData.labels,
                datasets: [
                  {
                    data: analytics.daily.map((r) => Number(r.completion_rate_pct) || 0),
                    colors: analytics.daily.map((r) => () => {
                      const rate = Number(r.completion_rate_pct) || 0;
                      if (rate >= 70) return COLORS.accent;
                      if (rate >= 40) return COLORS.warning;
                      return COLORS.danger;
                    }),
                  },
                ],
              }}
              width={Math.max(CHART_WIDTH, chartData.labels.length * 28)}
              height={180}
              yAxisLabel=""
              yAxisSuffix="%"
              withCustomBarColorFromData
              flatColor
              fromZero
              showBarTops={false}
              chartConfig={{
                backgroundColor: COLORS.surface,
                backgroundGradientFrom: COLORS.surface,
                backgroundGradientTo: COLORS.surface,
                decimalPlaces: 0,
                color: (opacity = 1) => `rgba(16,185,129,${opacity})`,
                labelColor: () => COLORS.textMuted,
                propsForLabels: { fontSize: 10 },
              }}
              style={[styles.chart, { marginTop: SPACING.sm }]}
            />
          </ScrollView>
        </View>
      ) : (
        <View style={[styles.chartCard, styles.emptyChart, SHADOW.small]}>
          <Text style={styles.emptyChartIcon}>📊</Text>
          <Text style={styles.emptyChartText}>No data for this period yet.</Text>
          <Text style={styles.emptyChartSub}>Start adding tasks to see your analytics.</Text>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  content: {
    paddingVertical: SPACING.md,
    paddingBottom: SPACING.xxl,
  },
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rangeRow: {
    flexDirection: 'row',
    paddingHorizontal: SPACING.md,
    gap: SPACING.sm,
    marginBottom: SPACING.md,
  },
  rangeBtn: {
    flex: 1,
    paddingVertical: SPACING.sm,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.surface,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  rangeBtnActive: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  rangeBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.textSecondary,
  },
  rangeBtnTextActive: {
    color: COLORS.surface,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: SPACING.md,
    gap: SPACING.sm,
    marginBottom: SPACING.md,
  },
  statCard: {
    width: (SCREEN_WIDTH - SPACING.md * 2 - SPACING.sm * 2) / 3,
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.md,
    padding: SPACING.md,
    alignItems: 'center',
  },
  statValue: {
    fontSize: 22,
    fontWeight: '800',
    color: COLORS.text,
  },
  statLabel: {
    fontSize: 11,
    color: COLORS.textSecondary,
    marginTop: 2,
    textAlign: 'center',
  },
  statSubLabel: {
    fontSize: 10,
    color: COLORS.textMuted,
    marginTop: 1,
  },
  chartCard: {
    marginHorizontal: SPACING.md,
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.lg,
    padding: SPACING.md,
  },
  chartTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.text,
    marginBottom: SPACING.sm,
  },
  chartSubtitle: {
    fontSize: 11,
    color: COLORS.textMuted,
    marginTop: SPACING.sm,
    marginBottom: SPACING.md,
  },
  legend: {
    flexDirection: 'row',
    gap: SPACING.md,
    marginBottom: SPACING.sm,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  legendDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  legendText: {
    fontSize: 12,
    color: COLORS.textSecondary,
  },
  chart: {
    borderRadius: RADIUS.md,
  },
  emptyChart: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: SPACING.xxl,
  },
  emptyChartIcon: {
    fontSize: 40,
    marginBottom: SPACING.md,
  },
  emptyChartText: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.text,
    marginBottom: SPACING.xs,
  },
  emptyChartSub: {
    fontSize: 13,
    color: COLORS.textSecondary,
  },
});
