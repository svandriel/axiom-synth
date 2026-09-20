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
