use wasm_bindgen::prelude::*;

#[wasm_bindgen]
pub struct SawOscillator {
    sample_rate: f32,
    frequency: f32,
    phase: f32,
}

#[wasm_bindgen]
impl SawOscillator {
    #[wasm_bindgen(constructor)]
    pub fn new(sample_rate: f32, frequency: f32) -> Self {
        Self {
            sample_rate,
            frequency,
            phase: 0.0,
        }
    }

    pub fn set_frequency(&mut self, frequency: f32) {
        self.frequency = frequency;
    }

    /// Fills output buffers with a saw wave centered between -1.0 and 1.0
    pub fn process(&mut self, output: &mut [f32]) {
        let phase_increment = self.frequency / self.sample_rate;

        for sample in output.iter_mut() {
            // Sawtooth formula: maps phase [0.0, 1.0) to [-1.0, 1.0)
            *sample = 2.0 * self.phase - 1.0;

            self.phase += phase_increment;
            if self.phase >= 1.0 {
                self.phase -= 1.0;
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::SawOscillator;

    fn process(oscillator: &mut SawOscillator, frames: usize) -> Vec<f32> {
        let mut buffer = vec![0.0f32; frames];
        oscillator.process(&mut buffer);
        buffer
    }

    #[test]
    fn first_frame_is_minimum() {
        let samples = process(&mut SawOscillator::new(48_000.0, 440.0), 1);
        assert!((samples[0] - (-1.0)).abs() < 1e-6);
    }

    #[test]
    fn full_cycle_per_sample_sticks_to_minimum() {
        let samples = process(&mut SawOscillator::new(48_000.0, 48_000.0), 8);
        assert!(samples.iter().all(|s| (*s - (-1.0)).abs() < 1e-6));
    }

    #[test]
    fn half_cycle_alternates_phase() {
        let samples = process(&mut SawOscillator::new(48_000.0, 24_000.0), 4);
        assert!((samples[0] - (-1.0)).abs() < 1e-6);
        assert!((samples[1] - 0.0).abs() < 1e-6);
        assert!((samples[2] - (-1.0)).abs() < 1e-6);
        assert!((samples[3] - 0.0).abs() < 1e-6);
    }

    #[test]
    fn set_frequency_changes_phase_increment() {
        let mut oscillator = SawOscillator::new(48_000.0, 24_000.0);
        process(&mut oscillator, 4);
        oscillator.set_frequency(48_000.0);
        let samples = process(&mut oscillator, 4);
        assert!(samples.iter().all(|s| (*s - (-1.0)).abs() < 1e-6));
    }
}
