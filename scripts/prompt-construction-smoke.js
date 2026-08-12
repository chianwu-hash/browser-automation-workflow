const assert = require('assert');
const {
  buildFirstVariantPrompt,
  buildSequencePrompt,
} = require('../lib/chatgpt/image-batch');

const productPrompt = 'Create a vertical LINE card with one mascot in the bottom-right corner.';
const firstVariantPrompt = buildFirstVariantPrompt(productPrompt, 1);
const sequencePrompt = buildSequencePrompt(
  { index: 1, name: '01-card.txt', prompt: productPrompt },
  1,
  true
);

for (const builtPrompt of [firstVariantPrompt, sequencePrompt]) {
  assert(builtPrompt.includes(productPrompt));
  assert(!builtPrompt.includes('AI administrative workbench'));
  assert(!builtPrompt.includes('Dingxi mascot integrity'));
  assert(!builtPrompt.includes('10% of slide height'));
  assert(!builtPrompt.includes('top-right corner clear'));
}

console.log('Prompt construction smoke test passed without product-specific rule injection.');
