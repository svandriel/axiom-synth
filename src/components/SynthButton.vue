<template>
  <button
    class="osc-button m-5 flex h-16 w-16 flex-row items-center justify-center rounded-lg p-3 text-sm shadow-out-xs dark:shadow-out-xs-dark"
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

    <div class="label">
      <slot />
    </div>
    <!-- <span class="underline"></span> -->
  </button>
</template>
