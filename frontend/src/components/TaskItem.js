import React, { useState, useRef, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Animated,
  StyleSheet,
  Alert,
  Platform,
} from 'react-native';
import { COLORS, SPACING, RADIUS, SHADOW } from '../constants/theme';

const CHECK_SIZE = 24;

export default function TaskItem({ task, onToggle, onEdit, onDelete }) {
  const [isEditing, setIsEditing] = useState(false);
  const [editText, setEditText] = useState(task.task_description);
  const inputRef = useRef(null);

  // Animated scale for check tap
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const fadeAnim = useRef(new Animated.Value(task.is_completed ? 0.5 : 1)).current;

  const animateCheck = useCallback(() => {
    Animated.sequence([
      Animated.timing(scaleAnim, { toValue: 0.92, duration: 80, useNativeDriver: true }),
      Animated.timing(scaleAnim, { toValue: 1, duration: 120, useNativeDriver: true }),
    ]).start();
    Animated.timing(fadeAnim, {
      toValue: task.is_completed ? 1 : 0.5,
      duration: 200,
      useNativeDriver: true,
    }).start();
  }, [scaleAnim, fadeAnim, task.is_completed]);

  const handleToggle = useCallback(() => {
    animateCheck();
    onToggle(task.task_id, !task.is_completed);
  }, [animateCheck, onToggle, task.task_id, task.is_completed]);

  const handleEditCommit = useCallback(() => {
    const trimmed = editText.trim();
    if (!trimmed) {
      setEditText(task.task_description);
      setIsEditing(false);
      return;
    }
    if (trimmed !== task.task_description) {
      onEdit(task.task_id, trimmed);
    }
    setIsEditing(false);
  }, [editText, task.task_description, task.task_id, onEdit]);

  const handleDeletePress = useCallback(() => {
    Alert.alert(
      'Delete Task',
      'Are you sure you want to delete this task?',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: () => onDelete(task.task_id) },
      ]
    );
  }, [onDelete, task.task_id]);

  const handleLongPress = useCallback(() => {
    setEditText(task.task_description);
    setIsEditing(true);
    setTimeout(() => inputRef.current?.focus(), 50);
  }, [task.task_description]);

  return (
    <Animated.View style={[styles.container, { transform: [{ scale: scaleAnim }] }, SHADOW.small]}>
      {/* Checkbox */}
      <TouchableOpacity
        style={[styles.checkbox, task.is_completed && styles.checkboxChecked]}
        onPress={handleToggle}
        activeOpacity={0.8}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        {task.is_completed && (
          <Text style={styles.checkmark}>✓</Text>
        )}
      </TouchableOpacity>

      {/* Task text / edit input */}
      <Animated.View style={[styles.textContainer, { opacity: fadeAnim }]}>
        {isEditing ? (
          <TextInput
            ref={inputRef}
            style={styles.textInput}
            value={editText}
            onChangeText={setEditText}
            onBlur={handleEditCommit}
            onSubmitEditing={handleEditCommit}
            returnKeyType="done"
            multiline={false}
            autoFocus
          />
        ) : (
          <TouchableOpacity onLongPress={handleLongPress} activeOpacity={0.7} onPress={handleToggle}>
            <Text
              style={[
                styles.taskText,
                task.is_completed && styles.taskTextCompleted,
              ]}
              numberOfLines={3}
            >
              {task.task_description}
            </Text>
          </TouchableOpacity>
        )}
      </Animated.View>

      {/* Action buttons */}
      {!isEditing && (
        <View style={styles.actions}>
          <TouchableOpacity
            style={styles.actionBtn}
            onPress={handleLongPress}
            hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
          >
            <Text style={styles.editIcon}>✎</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.actionBtn}
            onPress={handleDeletePress}
            hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
          >
            <Text style={styles.deleteIcon}>✕</Text>
          </TouchableOpacity>
        </View>
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.md,
    paddingVertical: SPACING.sm + 4,
    paddingHorizontal: SPACING.md,
    marginVertical: 4,
    marginHorizontal: SPACING.md,
  },
  checkbox: {
    width: CHECK_SIZE,
    height: CHECK_SIZE,
    borderRadius: RADIUS.sm,
    borderWidth: 2,
    borderColor: COLORS.incomplete,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: SPACING.sm + 4,
    flexShrink: 0,
    backgroundColor: COLORS.surface,
  },
  checkboxChecked: {
    backgroundColor: COLORS.complete,
    borderColor: COLORS.complete,
  },
  checkmark: {
    color: COLORS.surface,
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 15,
  },
  textContainer: {
    flex: 1,
  },
  taskText: {
    fontSize: 15,
    color: COLORS.text,
    lineHeight: 22,
  },
  taskTextCompleted: {
    textDecorationLine: 'line-through',
    color: COLORS.textMuted,
  },
  textInput: {
    fontSize: 15,
    color: COLORS.text,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.primary,
    paddingVertical: 2,
    paddingHorizontal: 0,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: SPACING.xs,
  },
  actionBtn: {
    paddingHorizontal: SPACING.xs,
    paddingVertical: 4,
  },
  editIcon: {
    fontSize: 16,
    color: COLORS.textMuted,
  },
  deleteIcon: {
    fontSize: 14,
    color: COLORS.danger,
    fontWeight: '600',
  },
});
