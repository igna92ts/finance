const fs = require('fs'),
  Random = require('random-js'),
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
  return pickRandomElements(getRandomInt(100, 4000), possibleGenes);
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
  const newPopulation = population.map((cromosome, popIndex) => {
    const decodedCromosome = decode(cromosome);
    const features = decodedCromosome.map(g => (g.param ? `${g.fn.name}${g.param}` : `${g.fn.name}`));
    data = pipe(
      data,
      [arima.exponentialSmoothing, 'price'],
      ...decodedCromosome.map(
        gene =>
          gene.param ? [gene.fn, gene.param, `${gene.fn.name}${gene.param}`] : [gene.fn, `${gene.fn.name}`]
      )
    );
    const FOLDS = 10;
    const chunked = chunkArray(data, FOLDS);
    const classifications = chunked.map((chunk, index) => {
      const trainingData = mergeWithout(index, chunked);
      const sample = getSample(500, data);
      const treeObj = treeBuilder.buildTree(features, sample);
      const tree = treeObj.fn;
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
    console.log(`Tested member ${popIndex} of the population`);
    return { cromosome, result: classifications.reduce((sum, c) => sum + c, 0) / classifications.length };
  });
  return {
    newPopulation,
    newData: data
  };
};

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
const possibleGenes = genes(fnObjects);
const mutate = cromosome => {
  return cromosome.map(c => {
    const num1 = getRandomInt(0, 1000);
    const num2 = getRandomInt(0, 1000);
    if (num1 === num2) return Random.pick(mt, possibleGenes);
    else return c;
  });
};

const crossOver = (father, mother) => {
  const fatherSplitPoint = getRandomInt(0, father.cromosome.length);
  const fatherHead = father.cromosome.slice(0, fatherSplitPoint);
  const fatherTail = father.cromosome.slice(fatherSplitPoint);

  const motherSplitPoint = getRandomInt(0, mother.cromosome.length);
  const motherHead = mother.cromosome.slice(0, motherSplitPoint);
  const motherTail = mother.cromosome.slice(motherSplitPoint);

  return [mutate([...fatherHead, ...motherTail]), mutate([...motherHead, ...fatherTail])];
};

const createChildrenPair = weightedPopulation => {
  const rndFather = getRandomInt(0, 100);
  const father = weightedPopulation.find(w => rndFather >= w.weight[0] && rndFather + 1 < w.weight[1]);
  const rndMother = getRandomInt(0, 100);
  const mother = weightedPopulation.find(w => rndMother >= w.weight[0] && rndMother + 1 < w.weight[1]);
  return crossOver(father, mother);
};

const generateChildren = population => {
  const total = population.reduce((t, p) => t + p.result, 0);
  let temp = 0;
  const weightedPopulation = population.map(p => {
    const proportion = temp + (p.result * 100) / total;
    const weightedMember = {
      ...p,
      weight: [temp, proportion]
    };
    temp = proportion;
    return weightedMember;
  });
  let children = [];
  while (children.length < population.length) {
    children = [...children, ...createChildrenPair(weightedPopulation)];
  }
  return children;
};

const dumpToJson = population => {
  const json = JSON.stringify(population);
  return new Promise((resolve, reject) => {
    fs.writeFile('genetic_result.json', json, err => {
      if (err) reject(err);
      else console.log('SUCCESS');
    });
  });
};

const run = async () => {
  const EPOCH_COUNT = 100;
  const POPULATION_SIZE = 100;
  const existingData = await arima.fetchTrades();
  let data = arima.expectedAction(
    existingData.map(d => ({ time: d.time, realPrice: d.realPrice, volume: d.volume }))
  );
  const initialPopulation = generatePopulation(POPULATION_SIZE, genes(fnObjects));
  let population = initialPopulation;
  for (let i = 0; i < EPOCH_COUNT; i++) {
    console.log(`////////////////////   EPOCH NUMBER ${i}  ////////////////////////`);
    const testResults = test(data, population);
    population = generateChildren(testResults.newPopulation);
    data = testResults.newData;
  }
  await dumpToJson(population);
};

run();
// const foos = [
//   { fn: () => 1, takesParams: false },
//   { fn: () => 2, takesParams: true },
//   { fn: () => 3, takesParams: true }
// ];
// const population = generatePopulation(genes(foos));
