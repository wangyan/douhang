import { request as httpRequest, type RequestOptions } from 'node:http';
import { request as httpsRequest } from 'node:https';
import type {
  DockerEngineInfo,
  DockerResourceSummary,
  DockerStatusSummary,
} from '@/types';

/**
 * Docker Engine API 客户端（直连，不引入第三方 SDK）
 *
 * 本项目只用四个只读接口，因此直接用 node:http 访问：
 *   GET /_ping                  探活
 *   GET /containers/json        容器列表
 *   GET /info                   引擎信息
 *   GET /containers/{id}/stats  单容器资源快照
 *
 * 连接目标由 `DOCKER_HOST` 决定，支持 `unix:///path/to.sock` 与
 * `tcp://host:port`（含 https）；未设置时使用本地 `/var/run/docker.sock`。
 *
 * 所有失败都不向调用方抛出：返回降级数据，由接口层以 available=false 呈现。
 */

const DEFAULT_SOCKET = '/var/run/docker.sock';
const DEFAULT_TCP_PORT = 2375;
/** 单次请求超时；避免 Docker 无响应时挂住 Widget 刷新 */
const REQUEST_TIMEOUT_MS = 5000;

interface DockerTarget {
  socketPath?: string;
  host?: string;
  port?: number;
  protocol: 'http:' | 'https:';
}

/** 解析连接目标：DOCKER_HOST 优先，未设置或无法解析时回落本地 socket */
function resolveTarget(): DockerTarget {
  const raw = process.env.DOCKER_HOST?.trim();
  if (!raw) return { socketPath: DEFAULT_SOCKET, protocol: 'http:' };

  if (raw.startsWith('unix://')) {
    return { socketPath: raw.slice('unix://'.length), protocol: 'http:' };
  }

  try {
    const url = new URL(raw);
    if (url.protocol === 'unix:') {
      return { socketPath: url.pathname, protocol: 'http:' };
    }
    return {
      host: url.hostname,
      port: Number(url.port) || DEFAULT_TCP_PORT,
      protocol: url.protocol === 'https:' ? 'https:' : 'http:',
    };
  } catch {
    return { socketPath: DEFAULT_SOCKET, protocol: 'http:' };
  }
}

/** 发一个 GET 请求，返回原始响应体文本 */
function dockerRequest(path: string): Promise<string> {
  const target = resolveTarget();
  const options: RequestOptions = {
    path,
    method: 'GET',
    // Docker Engine 对 Host 头不敏感，但部分反向代理需要它存在
    headers: { Host: 'docker', Accept: 'application/json' },
    ...(target.socketPath
      ? { socketPath: target.socketPath }
      : { host: target.host, port: target.port }),
  };
  const send = target.protocol === 'https:' ? httpsRequest : httpRequest;

  return new Promise((resolve, reject) => {
    const req = send(options, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (chunk: Buffer) => chunks.push(chunk));
      res.on('end', () => {
        const status = res.statusCode ?? 0;
        if (status < 200 || status >= 300) {
          reject(new Error(`Docker API ${path} 返回状态 ${status}`));
          return;
        }
        resolve(Buffer.concat(chunks).toString('utf-8'));
      });
    });

    req.setTimeout(REQUEST_TIMEOUT_MS, () => {
      req.destroy(new Error(`Docker API ${path} 请求超时`));
    });
    req.on('error', reject);
    req.end();
  });
}

/** 发一个 GET 请求并把响应体解析为 JSON */
async function dockerGetJson<T>(path: string): Promise<T> {
  const text = await dockerRequest(path);
  return JSON.parse(text) as T;
}

/** `GET /_ping` 探活；成功返回 true */
export async function isDockerAvailable(): Promise<boolean> {
  try {
    await dockerRequest('/_ping');
    return true;
  } catch {
    return false;
  }
}

/** `GET /containers/json` 的响应元素（只声明用到的字段） */
interface RawContainer {
  Id?: string;
  Names?: string[];
  State?: string;
}

/** 获取容器状态聚合（运行中 / 总数 / 停止 / 运行容器名） */
export async function getDockerStatus(): Promise<DockerStatusSummary> {
  const empty: DockerStatusSummary = {
    running: 0,
    total: 0,
    stopped: 0,
    runningNames: [],
  };

  try {
    const containers = await dockerGetJson<RawContainer[]>(
      '/containers/json?all=true',
    );
    const total = containers.length;
    const runningList = containers.filter((c) => c.State === 'running');
    return {
      running: runningList.length,
      total,
      stopped: total - runningList.length,
      runningNames: runningList.map((c) =>
        (c.Names?.[0] ?? '').replace(/^\//, ''),
      ),
    };
  } catch (e) {
    console.error('获取容器列表失败', e);
    return empty;
  }
}

/** `GET /info` 的响应中本项目使用的字段 */
interface RawEngineInfo {
  Images?: number;
  ServerVersion?: string;
  NCPU?: number;
  MemTotal?: number;
}

/** 获取 Docker 引擎信息（镜像数 / 版本 / 宿主机 CPU / 内存） */
export async function getDockerEngineInfo(): Promise<DockerEngineInfo> {
  const fallback: DockerEngineInfo = {
    images: 0,
    serverVersion: '',
    cpus: 0,
    memTotalBytes: 0,
  };

  try {
    const info = await dockerGetJson<RawEngineInfo>('/info');
    return {
      images: info.Images ?? 0,
      serverVersion: info.ServerVersion ?? '',
      cpus: info.NCPU ?? 0,
      memTotalBytes: info.MemTotal ?? 0,
    };
  } catch (e) {
    console.error('获取引擎信息失败', e);
    return fallback;
  }
}

/**
 * 获取资源水位（聚合 CPU / 内存 / 磁盘 IO）
 *
 * CPU 计算：one-shot stats 返回累计计数，跨请求用上次快照差值折算。
 * 内存：所有容器 mem_usage / mem_limit 之和的聚合百分比。
 * 磁盘 IO：Docker 只返回累计字节数，同样按上次快照差值折算速率。
 */
const lastResourceSamples = new Map<
  string,
  {
    cpuUsage: number;
    systemUsage: number;
    read: number;
    write: number;
    at: number;
  }
>();

const EMPTY_RESOURCE: DockerResourceSummary = {
  cpuPercent: 0,
  memoryPercent: 0,
  diskReadBytesPerSec: 0,
  diskWriteBytesPerSec: 0,
};

export async function getDockerResourceStats(): Promise<DockerResourceSummary> {
  try {
    const containers = await dockerGetJson<RawContainer[]>(
      '/containers/json?all=false',
    );
    if (containers.length === 0) return EMPTY_RESOURCE;

    const samples = await collectSamples(containers);

    // 清理已不存在容器的快照缓存，防止内存泄漏
    const activeIds = new Set(samples.map((s) => s.id));
    for (const id of lastResourceSamples.keys()) {
      if (!activeIds.has(id)) {
        lastResourceSamples.delete(id);
      }
    }

    // 聚合 CPU / 内存
    let totalCpuRatio = 0;
    let totalMemUsage = 0;
    let totalMemLimit = 0;
    let totalDiskRead = 0;
    let totalDiskWrite = 0;

    for (const sample of samples) {
      // 内存
      totalMemUsage += sample.memUsage;
      totalMemLimit += sample.memLimit;

      // 对齐上次累计计数；同一时间戳不折算，避免除以 0
      const previous = lastResourceSamples.get(sample.id);
      const elapsedSeconds =
        previous && sample.sampledAt > previous.at
          ? (sample.sampledAt - previous.at) / 1000
          : 0;
      if (previous && elapsedSeconds > 0) {
        // CPU：system_cpu_usage 是宿主机全局值，所有容器共享同一分母，
        // 整机水位 = 各容器 cpuDelta/systemDelta 之和
        const cpuDelta = sample.cpuUsage - previous.cpuUsage;
        const systemDelta = sample.systemUsage - previous.systemUsage;
        if (systemDelta > 0 && cpuDelta > 0) {
          totalCpuRatio += cpuDelta / systemDelta;
        }

        totalDiskRead +=
          Math.max(0, sample.diskRead - previous.read) / elapsedSeconds;
        totalDiskWrite +=
          Math.max(0, sample.diskWrite - previous.write) / elapsedSeconds;
      }
      lastResourceSamples.set(sample.id, {
        cpuUsage: sample.cpuUsage,
        systemUsage: sample.systemUsage,
        read: sample.diskRead,
        write: sample.diskWrite,
        at: sample.sampledAt,
      });
    }

    const cpuPercent = totalCpuRatio * 100;
    const memoryPercent =
      totalMemLimit > 0 ? (totalMemUsage / totalMemLimit) * 100 : 0;

    return {
      cpuPercent: Math.min(100, Math.round(cpuPercent * 10) / 10),
      memoryPercent: Math.min(100, Math.round(memoryPercent * 10) / 10),
      diskReadBytesPerSec: Math.round(totalDiskRead),
      diskWriteBytesPerSec: Math.round(totalDiskWrite),
    };
  } catch (e) {
    console.error('获取资源水位失败', e);
    return EMPTY_RESOURCE;
  }
}

/** `GET /containers/{id}/stats` 的响应片段（只声明用到的字段） */
interface RawStats {
  read?: string;
  cpu_stats?: {
    cpu_usage?: { total_usage?: number };
    system_cpu_usage?: number;
  };
  memory_stats?: { usage?: number; limit?: number };
  blkio_stats?: {
    io_service_bytes_recursive?: { op?: string; value?: number }[] | null;
  };
}

type Sample = {
  id: string;
  cpuUsage: number;
  systemUsage: number;
  memUsage: number;
  memLimit: number;
  diskRead: number;
  diskWrite: number;
  sampledAt: number;
};

/** 采样单个容器的资源快照；失败返回 null 由调用方过滤 */
async function sampleContainer(id: string): Promise<Sample | null> {
  try {
    // one-shot 跳过 Docker stats 的内部第二次采样等待
    const stats = await dockerGetJson<RawStats>(
      `/containers/${id}/stats?stream=false&one-shot=true`,
    );
    const cpu = stats.cpu_stats;
    const mem = stats.memory_stats;

    // 磁盘 IO（累计字节数）
    let diskRead = 0;
    let diskWrite = 0;
    for (const io of stats.blkio_stats?.io_service_bytes_recursive ?? []) {
      if (io.op?.toLowerCase() === 'read') diskRead += io.value ?? 0;
      if (io.op?.toLowerCase() === 'write') diskWrite += io.value ?? 0;
    }

    return {
      id,
      cpuUsage: cpu?.cpu_usage?.total_usage ?? 0,
      systemUsage: cpu?.system_cpu_usage ?? 0,
      memUsage: mem?.usage ?? 0,
      memLimit: mem?.limit ?? 0,
      diskRead,
      diskWrite,
      sampledAt: Date.parse(stats.read ?? '') || Date.now(),
    };
  } catch {
    return null;
  }
}

async function collectSamples(containers: RawContainer[]): Promise<Sample[]> {
  const samples = await Promise.all(
    containers.map((c) => (c.Id ? sampleContainer(c.Id) : null)),
  );
  return samples.filter((s): s is Sample => s !== null);
}
