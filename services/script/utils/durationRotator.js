import {s3, R2_BUCKETS, uploadBuffer, listKeys, getObjectAsText} from "../../shared/utils/r2-client.js";
// utils/durationRotator.js
import fs from 'fs';
import path from 'path';

class DurationRotator {
  constructor() {
    this.durations = [30, 60, 90];
    this.currentIndex = 0;
    this.stateFile = path.resolve('/mnt/data', 'duration-state.json');
    this.loadState();
  }

  loadState() {
    try {
      if (fs.existsSync(this.stateFile)) {
        const state = JSON.parse(fs.readFileSync(this.stateFile, 'utf-8'));
        this.currentIndex = state.currentIndex || 0;
      }
    } catch (error) {
      console.warn('Failed to load duration state, resetting:', error);
      this.currentIndex = 0;
    }
  }

  saveState() {
    try {
      fs.writeFileSync(
        this.stateFile,
        JSON.stringify({
          currentIndex: this.currentIndex,
          lastUpdated: new Date().toISOString(),
        }),
        'utf-8'
      );
    } catch (error) {
      console.error('Failed to save duration state:', error);
    }
  }

  getNextDuration() {
    const duration = this.durations[this.currentIndex];

    // Move to next duration, wrap around if needed
    this.currentIndex = (this.currentIndex + 1) % this.durations.length;
    this.saveState();

    console.log(
      `🔄 Duration rotation: ${duration} minutes (next: ${this.durations[this.currentIndex]}min)`
    );
    return duration;
  }

  // Optional: Get current duration without advancing
  getCurrentDuration() {
    return this.durations[this.currentIndex];
  }
}

// Singleton instance
export default new DurationRotator();
