const Random = require('random-js'),
  mt = Random.engines.mt19937().autoSeed(),
  { pipe, chunkArray, mergeWithout } = require('../helpers'),
  treeBuilder = require('../lambda/tree'),
  arima = require('../arima');

const pickRandomElements = (count, array) => {
  const elements = [];
  for (let i = 0; i < count; i++) {
    elements.push(Random.pick(mt, array));
  }
  return elements;
};

const genes = foos => {
  const values = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
  return [...values, ...foos];
};

const MAX_DECODED_SIZE = 50; // max amount of features
const decode = cromosome => {
  let temp = { param: 0 };
  const existing = [];
  const decoded = cromosome.reduce((res, gene, index) => {
    if (typeof gene === 'number' && !temp.fn) return res;
    if (typeof gene === 'object' && !gene.takesParams) {
      if (!existing.some(e => e === gene.fn.toString())) {
        existing.push(gene.fn.toString());
        res.push({ fn: gene.fn });
      }
      return res;
    }
    if (
      typeof gene === 'object' &&
      (typeof cromosome[index - 1] !== 'object' ||
        (typeof cromosome[index - 1] === 'object' && !cromosome[index - 1].takesParams))
    )
      temp.fn = gene.fn;
    if (typeof gene === 'number') temp.param += gene;
    const strGene = `${temp.fn.toString()}${temp.param}`;
    if (
      typeof cromosome[index + 1] !== 'number' &&
      typeof gene === 'number' &&
      !existing.some(e => e === strGene) &&
      temp.param > 1
    ) {
      res.push(temp);
      existing.push(strGene);
      temp = { param: 0 };
    }
    return res;
  }, []);
  return decoded.slice(0, MAX_DECODED_SIZE);
};

const getRandomInt = (min, max) => Random.integer(min, max)(mt);

const generateCromosome = possibleGenes => {
  return pickRandomElements(getRandomInt(100, 5000), possibleGenes);
};

const generatePopulation = (populationSize, geneArray) => {
  const population = [];
  for (let i = 0; i < populationSize; i++) {
    population.push(generateCromosome(geneArray));
  }
  return population;
};

const pickRandomElement = array => Random.pick(mt, array);
const getSample = (size, data) => {
  const sample = [];
  for (let i = 0; i < size; i++) {
    sample.push(pickRandomElement(data));
  }
  return sample;
};

const test = (rawData, population) => {
  let data = rawData;
  return population.map((cromosome, popIndex) => {
    const decodedCromosome = decode(cromosome);
    const features = decodedCromosome.map(g => (g.param ? `${g.fn.name}${g.param}` : `${g.fn.name}`));
    data = pipe(
      data,
      [arima.exponentialSmoothing, 'price'],
      ...decodedCromosome.map(
        gene =>
          gene.param ? [gene.fn, gene.param, `${gene.fn.name}${gene.param}`] : [gene.fn, `${gene.fn.name}`]
      ),
      [arima.expectedAction]
    );
    const FOLDS = 5;
    const chunked = chunkArray(data, FOLDS);
    const classifications = chunked.map((chunk, index) => {
      console.log(`Chunk ${index} for member ${popIndex} of the population`);
      const trainingData = mergeWithout(index, chunked);
      const sample = getSample(1000, data);
      const treeStr = treeBuilder.buildTree(features, sample);
      const tree = eval(treeStr);
      const cromosomePerf =
        chunk.reduce((res, c) => {
          const treeResult = tree(c);
          const predictedAction = Object.keys(treeResult).reduce((t, k) => {
            if (treeResult[k] === Math.max(...['BUY', 'NOTHING', 'SELL'].map(e => treeResult[e]))) return k;
            else return t;
          });
          if (c.action === predictedAction) return res + 1;
          else return res;
        }, 0) / chunk.length;
      return cromosomePerf;
    });
    return { cromosome, result: classifications.reduce((sum, c) => sum + c, 0) / classifications.length };
  });
};

const run = async () => {
  const EPOCH_COUNT = 100;
  const fnObjects = [
    { fn: arima.movingAvg, takesParams: true },
    { fn: arima.expMovingAvg, takesParams: true },
    { fn: arima.priceRateOfChange, takesParams: true },
    { fn: arima.williamsR, takesParams: true },
    { fn: arima.stdDeviation, takesParams: true },
    { fn: arima.stochasticOscillator, takesParams: true },
    { fn: arima.relStrIndex, takesParams: true },
    { fn: arima.onVolumeBalance, takesParams: false }
  ];
  const existingData = await arima.fetchTrades();
  const rawData = existingData.map(d => ({ time: d.time, realPrice: d.realPrice, volume: d.volume }));
  const initialPopulation = generatePopulation(100, genes(fnObjects));
  for (let i = 0; i < EPOCH_COUNT; i++) {
    const testResults = test(rawData, initialPopulation);
    debugger;
  }
};

run();
// const foos = [
//   { fn: () => 1, takesParams: false },
//   { fn: () => 2, takesParams: true },
//   { fn: () => 3, takesParams: true }
// ];
// const population = generatePopulation(genes(foos));
