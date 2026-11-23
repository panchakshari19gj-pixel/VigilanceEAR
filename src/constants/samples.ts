export interface DriverSampleFrame {
  id: string;
  label: string;
  caption: string;
  imageUrl: string;
}

export const DRIVER_SAMPLE_FRAMES: DriverSampleFrame[] = [
  {
    id: 'sample-alert',
    label: 'Alert Baseline',
    caption: 'Attentive driver · Eyes open · Forward gaze',
    imageUrl: '/src/assets/images/driver_alert_sample_1794825353273.jpg',
  },
  {
    id: 'sample-drowsy',
    label: 'Heavy Eyelids',
    caption: 'Fatigued driver · Drooping lids · Head tilt',
    imageUrl: '/src/assets/images/driver_drowsy_sample_1794825354584.jpg',
  },
  {
    id: 'sample-yawn',
    label: 'Yawn & Squint',
    caption: 'Yawning driver · High MAR · Narrowed eyes',
    imageUrl: '/src/assets/images/driver_yawn_sample_1794825353847.jpg',
  },
];
