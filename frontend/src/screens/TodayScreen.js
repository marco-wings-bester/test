import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  ActivityIndicator,
  Alert,
  TouchableOpacity,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  RefreshControl,
  Animated,
} from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import DateNavigator from '../components/DateNavigator';
import TaskItem from '../components/TaskItem';
import RecordButton from '../components/RecordButton';
import { COLORS, SPACING, RADIUS, SHADOW } from '../constants/theme';
import { today } from '../utils/dateUtils';
import { getDeviceId } from '../utils/deviceId';
import { enqueue, drainQueue, queueLength } from '../utils/offlineQueue';
import { fetchTasks, uploadAudio, createTasks, updateTask, deleteTask, syncOfflineItem } from '../services/api';

const PROCESSING_STATES = {
  IDLE: 'idle',
  UPLOADING: 'uploading',
  TRANSCRIBING: 'transcribing',
  SYNTHESISING: 'synthesising',
  SAVING: 'saving',
};

const PROCESSING_LABELS = {
  [PROCESSING_STATES.UPLOADING]: 'Uploading audio…',
  [PROCESSING_STATES.TRANSCRIBING]: 'Transcribing…',
  [PROCESSING_STATES.SYNTHESISING]: 'Extracting tasks…',
  [PROCESSING_STATES.SAVING]: 'Saving…',
};

export default function TodayScreen() {
  const [selectedDate, setSelectedDate] = useState(today());
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [processingState, setProcessingState] = useState(PROCESSING_STATES.IDLE);
  const [isOnline, setIsOnline] = useState(true);
  const [queueCount, setQueueCount] = useState(0);
  const [newTaskText, setNewTaskText] = useState('');
  const [addingTask, setAddingTask] = useState(false);

  const deviceIdRef = useRef(null);
  const bannerAnim = useRef(new Animated.Value(0)).current;

  // ─── Init ─────────────────────────────────────────────────────────────────

  useEffect(() => {
    (async () => {
      deviceIdRef.current = await getDeviceId();
      await refreshQueueCount();
      loadTasks();
    })();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Network monitoring ───────────────────────────────────────────────────

  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener(async (state) => {
      const online = state.isConnected && state.isInternetReachable;
      setIsOnline(!!online);

      if (online) {
        await syncOfflineQueue();
      }
    });
    return unsubscribe;
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Offline banner animation ─────────────────────────────────────────────

  useEffect(() => {
    Animated.timing(bannerAnim, {
      toValue: isOnline ? 0 : 1,
      duration: 300,
      useNativeDriver: false,
    }).start();
  }, [isOnline, bannerAnim]);

  // ─── Load tasks for selected date ─────────────────────────────────────────

  const loadTasks = useCallback(async (date) => {
    if (!deviceIdRef.current) return;
    const targetDate = date || selectedDate;
    setLoading(true);
    try {
      const data = await fetchTasks(deviceIdRef.current, targetDate);
      setTasks(data.tasks || []);
    } catch (err) {
      Alert.alert('Error', `Failed to load tasks: ${err.message}`);
    } finally {
      setLoading(false);
    }
  }, [selectedDate]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadTasks();
    setRefreshing(false);
  }, [loadTasks]);

  useEffect(() => {
    loadTasks(selectedDate);
  }, [selectedDate]); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Date navigation ──────────────────────────────────────────────────────

  const handleDateChange = useCallback((dateStr) => {
    setSelectedDate(dateStr);
  }, []);

  // ─── Voice recording ──────────────────────────────────────────────────────

  const handleRecordingComplete = useCallback(async ({ uri, mimeType }) => {
    if (!isOnline) {
      // Queue for later
      await enqueue({
        deviceId: deviceIdRef.current,
        taskDate: selectedDate,
        fileUri: uri,
        mimeType,
      });
      await refreshQueueCount();
      Alert.alert(
        'Saved Offline',
        'You\'re offline. Your recording has been saved and will be processed once you reconnect.'
      );
      return;
    }

    // Online path: upload immediately
    setProcessingState(PROCESSING_STATES.UPLOADING);
    try {
      setProcessingState(PROCESSING_STATES.TRANSCRIBING);
      const result = await uploadAudio(uri, deviceIdRef.current, selectedDate, mimeType);

      if (!result.tasks || result.tasks.length === 0) {
        Alert.alert('No Tasks Found', 'No actionable tasks were detected in your recording. Try speaking more clearly or adding tasks manually.');
        return;
      }

      setTasks((prev) => [...prev, ...result.tasks]);
    } catch (err) {
      Alert.alert('Processing Error', err.message);
    } finally {
      setProcessingState(PROCESSING_STATES.IDLE);
    }
  }, [isOnline, selectedDate]);

  // ─── Offline sync ─────────────────────────────────────────────────────────

  const syncOfflineQueue = useCallback(async () => {
    const count = await queueLength();
    if (count === 0) return;

    const { processed, failed, results } = await drainQueue(syncOfflineItem);

    // Refresh tasks after sync if items were processed for today's date
    const hadTodayItems = results.some((r) => r.success);
    if (hadTodayItems) {
      await loadTasks();
    }

    await refreshQueueCount();

    if (processed > 0) {
      Alert.alert(
        'Offline Sync Complete',
        `Processed ${processed} queued recording${processed !== 1 ? 's' : ''}.${failed > 0 ? ` ${failed} failed and will retry.` : ''}`
      );
    }
  }, [loadTasks]);

  const refreshQueueCount = useCallback(async () => {
    const count = await queueLength();
    setQueueCount(count);
  }, []);

  // ─── Task CRUD ────────────────────────────────────────────────────────────

  const handleToggle = useCallback(async (taskId, isCompleted) => {
    // Optimistic update
    setTasks((prev) =>
      prev.map((t) => t.task_id === taskId ? { ...t, is_completed: isCompleted } : t)
    );
    try {
      await updateTask(taskId, { isCompleted });
    } catch (err) {
      // Revert
      setTasks((prev) =>
        prev.map((t) => t.task_id === taskId ? { ...t, is_completed: !isCompleted } : t)
      );
      Alert.alert('Error', err.message);
    }
  }, []);

  const handleEdit = useCallback(async (taskId, newDescription) => {
    setTasks((prev) =>
      prev.map((t) => t.task_id === taskId ? { ...t, task_description: newDescription } : t)
    );
    try {
      await updateTask(taskId, { taskDescription: newDescription });
    } catch (err) {
      Alert.alert('Error', `Failed to update task: ${err.message}`);
    }
  }, []);

  const handleDelete = useCallback(async (taskId) => {
    setTasks((prev) => prev.filter((t) => t.task_id !== taskId));
    try {
      await deleteTask(taskId);
    } catch (err) {
      Alert.alert('Error', `Failed to delete task: ${err.message}`);
      // Reload to restore state
      loadTasks();
    }
  }, [loadTasks]);

  const handleAddTask = useCallback(async () => {
    const trimmed = newTaskText.trim();
    if (!trimmed) return;

    setAddingTask(false);
    setNewTaskText('');
    setProcessingState(PROCESSING_STATES.SAVING);

    try {
      const result = await createTasks(deviceIdRef.current, selectedDate, [trimmed]);
      if (result.tasks?.length > 0) {
        setTasks((prev) => [...prev, ...result.tasks]);
      }
    } catch (err) {
      Alert.alert('Error', err.message);
    } finally {
      setProcessingState(PROCESSING_STATES.IDLE);
    }
  }, [newTaskText, selectedDate]);

  // ─── Computed ─────────────────────────────────────────────────────────────

  const completedCount = tasks.filter((t) => t.is_completed).length;
  const totalCount = tasks.length;
  const progressPct = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;
  const isProcessing = processingState !== PROCESSING_STATES.IDLE;

  // ─── Render helpers ───────────────────────────────────────────────────────

  const renderTask = useCallback(({ item }) => (
    <TaskItem
      task={item}
      onToggle={handleToggle}
      onEdit={handleEdit}
      onDelete={handleDelete}
    />
  ), [handleToggle, handleEdit, handleDelete]);

  const renderEmptyList = () => (
    <View style={styles.emptyContainer}>
      <Text style={styles.emptyIcon}>📋</Text>
      <Text style={styles.emptyTitle}>No tasks yet</Text>
      <Text style={styles.emptySubtitle}>
        Record your voice or add a task manually to get started.
      </Text>
    </View>
  );

  const renderHeader = () => (
    <View style={styles.listHeader}>
      {totalCount > 0 && (
        <View style={styles.progressContainer}>
          <View style={styles.progressBar}>
            <Animated.View style={[styles.progressFill, { width: `${progressPct}%` }]} />
          </View>
          <Text style={styles.progressText}>
            {completedCount}/{totalCount} complete · {progressPct}%
          </Text>
        </View>
      )}
    </View>
  );

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      {/* Offline banner */}
      <Animated.View
        style={[
          styles.offlineBanner,
          {
            maxHeight: bannerAnim.interpolate({ inputRange: [0, 1], outputRange: [0, 48] }),
            opacity: bannerAnim,
          },
        ]}
      >
        <Text style={styles.offlineBannerText}>
          ⚡ Offline mode · {queueCount > 0 ? `${queueCount} recording${queueCount !== 1 ? 's' : ''} queued` : 'recordings will be queued'}
        </Text>
      </Animated.View>

      {/* Date navigation */}
      <DateNavigator selectedDate={selectedDate} onDateChange={handleDateChange} />

      {/* Processing overlay */}
      {isProcessing && (
        <View style={styles.processingBanner}>
          <ActivityIndicator size="small" color={COLORS.primary} />
          <Text style={styles.processingText}>
            {PROCESSING_LABELS[processingState] || 'Processing…'}
          </Text>
        </View>
      )}

      {/* Task list */}
      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={COLORS.primary} />
        </View>
      ) : (
        <FlatList
          data={tasks}
          keyExtractor={(item) => item.task_id}
          renderItem={renderTask}
          ListHeaderComponent={renderHeader}
          ListEmptyComponent={renderEmptyList}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              tintColor={COLORS.primary}
            />
          }
        />
      )}

      {/* Manual task input */}
      {addingTask && (
        <View style={[styles.addTaskContainer, SHADOW.medium]}>
          <TextInput
            style={styles.addTaskInput}
            placeholder="Type a new task…"
            placeholderTextColor={COLORS.textMuted}
            value={newTaskText}
            onChangeText={setNewTaskText}
            onSubmitEditing={handleAddTask}
            returnKeyType="done"
            autoFocus
            multiline={false}
          />
          <TouchableOpacity style={styles.addTaskBtn} onPress={handleAddTask}>
            <Text style={styles.addTaskBtnText}>Add</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.cancelTaskBtn}
            onPress={() => { setAddingTask(false); setNewTaskText(''); }}
          >
            <Text style={styles.cancelTaskBtnText}>✕</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Bottom toolbar */}
      <View style={[styles.toolbar, SHADOW.medium]}>
        {/* Add task button */}
        <TouchableOpacity
          style={styles.toolbarAddBtn}
          onPress={() => setAddingTask(true)}
          disabled={isProcessing}
        >
          <Text style={styles.toolbarAddIcon}>+</Text>
          <Text style={styles.toolbarAddText}>Add Task</Text>
        </TouchableOpacity>

        {/* Record button */}
        <RecordButton
          onRecordingComplete={handleRecordingComplete}
          disabled={isProcessing}
        />

        {/* Queue badge placeholder for symmetry */}
        <View style={styles.toolbarSpacer} />
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  offlineBanner: {
    backgroundColor: COLORS.warning,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  offlineBannerText: {
    color: '#78350F',
    fontSize: 13,
    fontWeight: '600',
    paddingVertical: SPACING.sm,
  },
  processingBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.primaryLight,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    gap: SPACING.sm,
  },
  processingText: {
    fontSize: 13,
    color: COLORS.primary,
    fontWeight: '600',
    marginLeft: SPACING.sm,
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  listContent: {
    paddingBottom: 160,
    flexGrow: 1,
  },
  listHeader: {
    paddingHorizontal: SPACING.md,
    paddingTop: SPACING.md,
  },
  progressContainer: {
    marginBottom: SPACING.sm,
  },
  progressBar: {
    height: 6,
    backgroundColor: COLORS.border,
    borderRadius: RADIUS.full,
    overflow: 'hidden',
    marginBottom: 6,
  },
  progressFill: {
    height: '100%',
    backgroundColor: COLORS.accent,
    borderRadius: RADIUS.full,
  },
  progressText: {
    fontSize: 12,
    color: COLORS.textSecondary,
    fontWeight: '500',
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: SPACING.xxl,
    paddingHorizontal: SPACING.xl,
  },
  emptyIcon: {
    fontSize: 48,
    marginBottom: SPACING.md,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.text,
    marginBottom: SPACING.sm,
  },
  emptySubtitle: {
    fontSize: 14,
    color: COLORS.textSecondary,
    textAlign: 'center',
    lineHeight: 21,
  },
  addTaskContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  addTaskInput: {
    flex: 1,
    fontSize: 15,
    color: COLORS.text,
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.sm,
    backgroundColor: COLORS.borderLight,
    borderRadius: RADIUS.md,
  },
  addTaskBtn: {
    marginLeft: SPACING.sm,
    backgroundColor: COLORS.primary,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderRadius: RADIUS.md,
  },
  addTaskBtnText: {
    color: COLORS.surface,
    fontWeight: '700',
    fontSize: 14,
  },
  cancelTaskBtn: {
    marginLeft: SPACING.sm,
    padding: SPACING.sm,
  },
  cancelTaskBtnText: {
    color: COLORS.textMuted,
    fontSize: 16,
    fontWeight: '600',
  },
  toolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: COLORS.surface,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.sm,
    paddingBottom: Platform.OS === 'ios' ? SPACING.xl : SPACING.sm,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  toolbarAddBtn: {
    alignItems: 'center',
    width: 72,
  },
  toolbarAddIcon: {
    fontSize: 24,
    color: COLORS.primary,
    fontWeight: '300',
    lineHeight: 28,
  },
  toolbarAddText: {
    fontSize: 11,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  toolbarSpacer: {
    width: 72,
  },
});
