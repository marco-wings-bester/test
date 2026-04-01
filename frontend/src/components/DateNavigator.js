import React, { useRef, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  Platform,
} from 'react-native';
import { COLORS, SPACING, RADIUS, FONTS } from '../constants/theme';
import { buildDateWindow, fromDateString, isToday, friendlyLabel } from '../utils/dateUtils';

const ITEM_WIDTH = 56;
const ITEM_MARGIN = 6;
const ITEM_TOTAL = ITEM_WIDTH + ITEM_MARGIN * 2;

const DAY_NAMES = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

const DATES = buildDateWindow(new Date().toISOString().slice(0, 10), 180);
const TODAY_INDEX = 180; // Center index

function DateItem({ dateStr, isSelected, onPress }) {
  const d = fromDateString(dateStr);
  const dayName = DAY_NAMES[d.getDay()];
  const dayNum = d.getDate();
  const todayFlag = isToday(dateStr);

  return (
    <TouchableOpacity
      style={[styles.dateItem, isSelected && styles.dateItemSelected, todayFlag && !isSelected && styles.dateItemToday]}
      onPress={() => onPress(dateStr)}
      activeOpacity={0.7}
    >
      <Text style={[styles.dayName, isSelected && styles.dayNameSelected]}>{dayName}</Text>
      <Text style={[styles.dayNum, isSelected && styles.dayNumSelected, todayFlag && !isSelected && styles.dayNumToday]}>
        {dayNum}
      </Text>
      {todayFlag && <View style={[styles.todayDot, isSelected && styles.todayDotSelected]} />}
    </TouchableOpacity>
  );
}

export default function DateNavigator({ selectedDate, onDateChange }) {
  const listRef = useRef(null);

  const getInitialIndex = useCallback(() => {
    const idx = DATES.indexOf(selectedDate);
    return idx >= 0 ? idx : TODAY_INDEX;
  }, [selectedDate]);

  const scrollToDate = useCallback((dateStr) => {
    const idx = DATES.indexOf(dateStr);
    if (idx >= 0 && listRef.current) {
      listRef.current.scrollToIndex({ index: idx, animated: true, viewPosition: 0.5 });
    }
  }, []);

  const handleDatePress = useCallback((dateStr) => {
    onDateChange(dateStr);
    scrollToDate(dateStr);
  }, [onDateChange, scrollToDate]);

  const getItemLayout = useCallback((_data, index) => ({
    length: ITEM_TOTAL,
    offset: ITEM_TOTAL * index,
    index,
  }), []);

  const renderItem = useCallback(({ item }) => (
    <DateItem
      dateStr={item}
      isSelected={item === selectedDate}
      onPress={handleDatePress}
    />
  ), [selectedDate, handleDatePress]);

  return (
    <View style={styles.container}>
      {/* Month/Year header */}
      <View style={styles.header}>
        <Text style={styles.headerLabel}>{friendlyLabel(selectedDate)}</Text>
        <TouchableOpacity
          onPress={() => {
            const todayStr = new Date().toISOString().slice(0, 10);
            onDateChange(todayStr);
            scrollToDate(todayStr);
          }}
          style={styles.todayButton}
        >
          <Text style={styles.todayButtonText}>Today</Text>
        </TouchableOpacity>
      </View>

      <FlatList
        ref={listRef}
        data={DATES}
        keyExtractor={(item) => item}
        renderItem={renderItem}
        horizontal
        showsHorizontalScrollIndicator={false}
        getItemLayout={getItemLayout}
        initialScrollIndex={getInitialIndex()}
        onScrollToIndexFailed={(info) => {
          setTimeout(() => {
            listRef.current?.scrollToIndex({ index: info.index, animated: false, viewPosition: 0.5 });
          }, 200);
        }}
        contentContainerStyle={styles.listContent}
        decelerationRate="fast"
        snapToInterval={ITEM_TOTAL}
        snapToAlignment="center"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: COLORS.surface,
    paddingTop: SPACING.sm,
    paddingBottom: SPACING.sm,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.md,
    marginBottom: SPACING.sm,
  },
  headerLabel: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.text,
  },
  todayButton: {
    paddingHorizontal: SPACING.sm,
    paddingVertical: 4,
    backgroundColor: COLORS.primaryLight,
    borderRadius: RADIUS.full,
  },
  todayButtonText: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.primary,
  },
  listContent: {
    paddingHorizontal: SPACING.sm,
  },
  dateItem: {
    width: ITEM_WIDTH,
    marginHorizontal: ITEM_MARGIN,
    height: 66,
    borderRadius: RADIUS.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.borderLight,
  },
  dateItemSelected: {
    backgroundColor: COLORS.primary,
  },
  dateItemToday: {
    borderWidth: 2,
    borderColor: COLORS.primary,
    backgroundColor: COLORS.primaryLight,
  },
  dayName: {
    fontSize: 11,
    fontWeight: '500',
    color: COLORS.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  dayNameSelected: {
    color: 'rgba(255,255,255,0.8)',
  },
  dayNum: {
    fontSize: 20,
    fontWeight: '700',
    color: COLORS.text,
    marginTop: 2,
  },
  dayNumSelected: {
    color: COLORS.surface,
  },
  dayNumToday: {
    color: COLORS.primary,
  },
  todayDot: {
    width: 5,
    height: 5,
    borderRadius: RADIUS.full,
    backgroundColor: COLORS.primary,
    marginTop: 3,
  },
  todayDotSelected: {
    backgroundColor: COLORS.surface,
  },
});
