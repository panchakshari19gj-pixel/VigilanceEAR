import type {
  CalibrationConfig,
  DriverProfile,
  DrowsinessLogEvent,
  InputSourceMode,
  MonitoringSession,
} from '../types/telemetry';

async function requestJson<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { error?: string }).error || `Request failed (${res.status})`);
  }
  return res.json() as Promise<T>;
}

export const apiClient = {
  async getDrivers(): Promise<DriverProfile[]> {
    const data = await requestJson<{ drivers: DriverProfile[] }>('/api/drivers');
    return data.drivers;
  },

  async createDriver(payload: {
    name: string;
    licenseCode: string;
    vehicleUnit: string;
    baselineEar?: number;
  }): Promise<DriverProfile> {
    const data = await requestJson<{ driver: DriverProfile }>('/api/drivers', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    return data.driver;
  },

  async updateDriver(id: string, payload: Partial<DriverProfile>): Promise<DriverProfile> {
    const data = await requestJson<{ driver: DriverProfile }>(`/api/drivers/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    });
    return data.driver;
  },

  async getSessions(driverId?: string): Promise<MonitoringSession[]> {
    const q = driverId && driverId !== 'all' ? `?driverId=${encodeURIComponent(driverId)}` : '';
    const data = await requestJson<{ sessions: MonitoringSession[] }>(`/api/sessions${q}`);
    return data.sessions;
  },

  async startSession(payload: {
    driverId: string;
    sourceMode: InputSourceMode;
    earThreshold: number;
  }): Promise<MonitoringSession> {
    const data = await requestJson<{ session: MonitoringSession }>('/api/sessions', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    return data.session;
  },

  async updateSession(id: string, payload: Partial<MonitoringSession>): Promise<MonitoringSession> {
    const data = await requestJson<{ session: MonitoringSession }>(`/api/sessions/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    });
    return data.session;
  },

  async getEvents(filters?: {
    driverId?: string;
    severity?: string;
    type?: string;
    search?: string;
  }): Promise<DrowsinessLogEvent[]> {
    const params = new URLSearchParams();
    if (filters?.driverId && filters.driverId !== 'all') params.set('driverId', filters.driverId);
    if (filters?.severity && filters.severity !== 'all') params.set('severity', filters.severity);
    if (filters?.type && filters.type !== 'all') params.set('type', filters.type);
    if (filters?.search?.trim()) params.set('search', filters.search.trim());
    const qs = params.toString();
    const data = await requestJson<{ events: DrowsinessLogEvent[] }>(`/api/events${qs ? `?${qs}` : ''}`);
    return data.events;
  },

  async createEvent(payload: Omit<DrowsinessLogEvent, 'id'>): Promise<DrowsinessLogEvent> {
    const data = await requestJson<{ event: DrowsinessLogEvent }>('/api/events', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    return data.event;
  },

  async acknowledgeEvent(id: string): Promise<DrowsinessLogEvent> {
    const data = await requestJson<{ event: DrowsinessLogEvent }>(`/api/events/${id}/ack`, {
      method: 'PATCH',
    });
    return data.event;
  },

  async deleteEvent(id: string): Promise<void> {
    await requestJson<{ ok: boolean }>(`/api/events/${id}`, { method: 'DELETE' });
  },

  async clearEvents(driverId?: string): Promise<void> {
    const q = driverId && driverId !== 'all' ? `?driverId=${encodeURIComponent(driverId)}` : '';
    await requestJson<{ ok: boolean }>(`/api/events${q}`, { method: 'DELETE' });
  },

  async getCalibration(): Promise<CalibrationConfig> {
    const data = await requestJson<{ calibration: CalibrationConfig }>('/api/calibration');
    return data.calibration;
  },

  async saveCalibration(calibration: CalibrationConfig): Promise<CalibrationConfig> {
    const data = await requestJson<{ calibration: CalibrationConfig }>('/api/calibration', {
      method: 'PUT',
      body: JSON.stringify(calibration),
    });
    return data.calibration;
  },
};
