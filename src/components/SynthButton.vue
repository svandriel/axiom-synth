<template>
  <button
    class="osc-button flex flex-row items-center justify-center m-5 p-3 rounded-sm"
    type="button"
    aria-pressed="false"
    aria-label="Oscillator 1"
  >
    <!-- <span class="led" aria-hidden="true"></span>

    <span class="wave-wrap">
      <svg class="wave" viewBox="0 0 130 80" aria-hidden="true">
        <path class="line" d="M5,55 C25,15 40,15 65,40 C90,65 105,65 125,25" />
      </svg>
    </span> -->

    <span class="label"><slot /></span>
    <!-- <span class="underline"></span> -->
  </button>
</template>
<style scoped>
button {
  height: 5rem;
  width: 5rem;
  /* background-color: var(--color-red-300); */
  box-shadow: var(--shadow-out);
}
</style>
