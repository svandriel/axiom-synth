#include "math_utils.h"

#define POW2F_FRACTION_SCALE 8388608.0f
#define POW2F_EXPONENT_BIAS 1065353216

float pow2f(float exponent)
{
    int bits = (int)(exponent * POW2F_FRACTION_SCALE) + POW2F_EXPONENT_BIAS;
    return *(float *)&bits;
}