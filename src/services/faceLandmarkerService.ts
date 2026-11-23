import { FaceLandmarker, FilesetResolver, type FaceLandmarkerResult } from '@mediapipe/tasks-vision';

export type LandmarkerStatus = 'idle' | 'loading' | 'ready' | 'error';

class FaceLandmarkerService {
  private videoLandmarker: FaceLandmarker | null = null;
  private imageLandmarker: FaceLandmarker | null = null;
  private videoInitPromise: Promise<FaceLandmarker> | null = null;
  private imageInitPromise: Promise<FaceLandmarker> | null = null;
  private visionFilesetPromise: ReturnType<typeof FilesetResolver.forVisionTasks> | null = null;
  private lastVideoTimestampMs = 0;

  private getVisionFileset() {
    if (!this.visionFilesetPromise) {
      this.visionFilesetPromise = FilesetResolver.forVisionTasks('/mediapipe/wasm').catch((err) => {
        this.visionFilesetPromise = null;
        throw err;
      });
    }
    return this.visionFilesetPromise;
  }

  public getCachedVideoLandmarker(): FaceLandmarker | null {
    return this.videoLandmarker;
  }

  /**
   * Runs synchronous VIDEO-mode detection with a guaranteed strictly-increasing integer timestamp
   * so rapid frames or switching between webcam and uploaded videos never triggers MediaPipe
   * monotonic packet timestamp errors.
   */
  public detectVideoSync(video: HTMLVideoElement): FaceLandmarkerResult | null {
    if (!this.videoLandmarker) return null;
    const rawMs = Math.round(performance.now());
    const nextTs = rawMs > this.lastVideoTimestampMs ? rawMs : this.lastVideoTimestampMs + 1;
    this.lastVideoTimestampMs = nextTs;
    return this.videoLandmarker.detectForVideo(video, nextTs);
  }

  public prewarmVideoLandmarker(): void {
    if (!this.videoLandmarker && !this.videoInitPromise) {
      void this.getVideoLandmarker().catch(() => {});
    }
  }

  public async getVideoLandmarker(): Promise<FaceLandmarker> {
    if (this.videoLandmarker) return this.videoLandmarker;
    if (this.videoInitPromise) return this.videoInitPromise;

    this.videoInitPromise = (async () => {
      try {
        const vision = await this.getVisionFileset();
        const landmarker = await FaceLandmarker.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath: '/mediapipe/face_landmarker.task',
            delegate: 'GPU',
          },
          runningMode: 'VIDEO',
          numFaces: 1,
          minFaceDetectionConfidence: 0.4,
          minFacePresenceConfidence: 0.4,
          minTrackingConfidence: 0.4,
          outputFaceBlendshapes: true,
          outputFacialTransformationMatrixes: true,
        }).catch(async () => {
          return FaceLandmarker.createFromOptions(vision, {
            baseOptions: {
              modelAssetPath: '/mediapipe/face_landmarker.task',
              delegate: 'CPU',
            },
            runningMode: 'VIDEO',
            numFaces: 1,
            minFaceDetectionConfidence: 0.4,
            minFacePresenceConfidence: 0.4,
            minTrackingConfidence: 0.4,
            outputFaceBlendshapes: true,
            outputFacialTransformationMatrixes: true,
          });
        });

        this.videoLandmarker = landmarker;
        return landmarker;
      } catch (err) {
        this.videoInitPromise = null;
        throw err;
      }
    })();

    return this.videoInitPromise;
  }

  public async getImageLandmarker(): Promise<FaceLandmarker> {
    if (this.imageLandmarker) return this.imageLandmarker;
    if (this.imageInitPromise) return this.imageInitPromise;

    this.imageInitPromise = (async () => {
      try {
        const vision = await this.getVisionFileset();
        const landmarker = await FaceLandmarker.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath: '/mediapipe/face_landmarker.task',
            delegate: 'CPU',
          },
          runningMode: 'IMAGE',
          numFaces: 1,
          minFaceDetectionConfidence: 0.4,
          minFacePresenceConfidence: 0.4,
          outputFaceBlendshapes: true,
          outputFacialTransformationMatrixes: true,
        });
        this.imageLandmarker = landmarker;
        return landmarker;
      } catch (err) {
        this.imageInitPromise = null;
        throw err;
      }
    })();

    return this.imageInitPromise;
  }

  public async detectImage(imageElement: HTMLImageElement): Promise<FaceLandmarkerResult> {
    const landmarker = await this.getImageLandmarker();
    return landmarker.detect(imageElement);
  }
}

export const faceLandmarkerService = new FaceLandmarkerService();
