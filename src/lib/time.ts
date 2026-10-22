/**
 * 首屏时钟时间格式化与时区解析
 *
 * 站点时区由环境变量 TZ 指定，缺省或非法时回退至客户端本地时区。
 */

const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六'];

/** 时区格式化器实例缓存 */
const formatterCache = new Map<string, Intl.DateTimeFormat>();

function zonedFormatter(timeZone: string): Intl.DateTimeFormat {
  const cached = formatterCache.get(timeZone);
  if (cached) return cached;
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
  formatterCache.set(timeZone, formatter);
  return formatter;
}

/**
 * 解析并校验时区标识
 *
 * 返回规范化的 IANA 时区名称；无效时区返回 undefined。
 */
export function resolveClockTimeZone(
  candidate?: string | null,
): string | undefined {
  const value = candidate?.trim();
  if (!value) return undefined;
  try {
    return zonedFormatter(value).resolvedOptions().timeZone;
  } catch {
    return undefined;
  }
}

export interface ClockParts {
  hour: number;
  minute: number;
  month: number;
  day: number;
  /** 星期序号，0 为周日 */
  weekday: number;
}

/** 获取指定时区下的时间组成部分；缺省时取客户端本地时间 */
export function getClockParts(date: Date, timeZone?: string): ClockParts {
  if (timeZone) {
    try {
      const formatted: Record<string, string> = {};
      for (const part of zonedFormatter(timeZone).formatToParts(date)) {
        formatted[part.type] = part.value;
      }

      const month = Number(formatted.month);
      const day = Number(formatted.day);
      const year = Number(formatted.year);
      const hour = Number(formatted.hour);
      const minute = Number(formatted.minute);

      if (
        !Number.isNaN(month) &&
        !Number.isNaN(day) &&
        !Number.isNaN(year) &&
        !Number.isNaN(hour) &&
        !Number.isNaN(minute)
      ) {
        return {
          hour: hour % 24,
          minute,
          month,
          day,
          weekday: new Date(Date.UTC(year, month - 1, day)).getUTCDay(),
        };
      }
    } catch {
      // 目标时区不可用时回退客户端本地时间
    }
  }

  return {
    hour: date.getHours(),
    minute: date.getMinutes(),
    month: date.getMonth() + 1,
    day: date.getDate(),
    weekday: date.getDay(),
  };
}

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

export function formatClockTime(
  target: Date | ClockParts,
  timeZone?: string,
): string {
  const { hour, minute } =
    'hour' in target ? target : getClockParts(target, timeZone);
  return `${pad(hour)}:${pad(minute)}`;
}

export function formatClockDate(
  target: Date | ClockParts,
  timeZone?: string,
): string {
  const { month, day, weekday } =
    'weekday' in target ? target : getClockParts(target, timeZone);
  return `${month}月${day}日 周${WEEKDAYS[weekday]}`;
}

export function getClockGreeting(
  target: Date | ClockParts,
  timeZone?: string,
): string {
  const { hour } = 'hour' in target ? target : getClockParts(target, timeZone);
  if (hour < 5) return '凌晨好';
  if (hour < 12) return '早上好';
  if (hour < 14) return '中午好';
  if (hour < 18) return '下午好';
  return '晚上好';
}
