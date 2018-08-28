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

const MAX_DECODED_SIZE = 40; // max amount of features
const decode = cromosome => {
  const decoded = cromosome.reduce((res, gene, index) => {
    if (!res.some(e => e === gene)) {
      res.push(gene);
    }
    return res;
  }, []);
  return decoded.slice(0, MAX_DECODED_SIZE);
};

const getRandomInt = (min, max) => Random.integer(min, max)(mt);

const CROMOSOME_SIZE = 1000;
const generateCromosome = possibleGenes => {
  return pickRandomElements(CROMOSOME_SIZE, possibleGenes);
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

const test = (data, population) => {
  return population.map((cromosome, popIndex) => {
    const features = decode(cromosome);
    const FOLDS = 10;
    const chunked = chunkArray(data, FOLDS);
    const classifications = chunked.map((chunk, index) => {
      const trainingData = mergeWithout(index, chunked);
      const sample = getSample(250, data);
      const treeObj = treeBuilder.buildTree(features, sample, false);
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
const mutate = (cromosome, possibleGenes) => {
  return cromosome.map(c => {
    const num1 = getRandomInt(0, 1000);
    const num2 = getRandomInt(0, 1000);
    if (num1 === num2) return Random.pick(mt, possibleGenes);
    else return c;
  });
};

const crossOver = (father, mother, possibleGenes) => {
  const splitPoint = getRandomInt(0, CROMOSOME_SIZE);
  const fatherHead = father.cromosome.slice(0, splitPoint);
  const fatherTail = father.cromosome.slice(splitPoint);

  const motherHead = mother.cromosome.slice(0, splitPoint);
  const motherTail = mother.cromosome.slice(splitPoint);

  return [
    mutate([...fatherHead, ...motherTail], possibleGenes),
    mutate([...motherHead, ...fatherTail], possibleGenes)
  ];
};

const createChildrenPair = (weightedPopulation, possibleGenes) => {
  const rndFather = getRandomInt(0, 99);
  const father = weightedPopulation.find(w => rndFather >= w.weight[0] && rndFather < w.weight[1]);
  const rndMother = getRandomInt(0, 99);
  const mother = weightedPopulation.find(w => rndMother >= w.weight[0] && rndMother < w.weight[1]);
  return crossOver(father, mother, possibleGenes);
};

const generateChildren = (population, possibleGenes) => {
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
    children = [...children, ...createChildrenPair(weightedPopulation, possibleGenes)];
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

const calculatePeriods = data => {
  const step = 5;
  const features = [];
  const foos = fnObjects.reduce((res, fnObject) => {
    if (fnObject.takesParams) {
      for (let i = step; i <= 50; i += step) {
        features.push(`${fnObject.fn.name}${i}`);
        res.push([fnObject.fn, i, `${fnObject.fn.name}${i}`]);
      }
    } else {
      features.push(`${fnObject.fn.name}`);
      res.push([fnObject.fn, `${fnObject.fn.name}`]);
    }
    return res;
  }, []);
  return {
    data: pipe(
      data.map(d => ({ time: d.time, realPrice: d.realPrice, volume: d.volume })),
      [arima.exponentialSmoothing, 'price'],
      ...foos,
      [arima.expectedAction]
    ),
    possibleGenes: features
  };
};

const run = async () => {
  const EPOCH_COUNT = 100;
  const POPULATION_SIZE = 100;
  const existingData = await arima.fetchTrades();
  const { data, possibleGenes } = calculatePeriods(existingData);
  const initialPopulation = generatePopulation(POPULATION_SIZE, possibleGenes);
  let population = initialPopulation;
  for (let i = 0; i < EPOCH_COUNT; i++) {
    console.log(`////////////////////   EPOCH NUMBER ${i}  ////////////////////////`);
    const newPopulation = test(data, population);
    population = generateChildren(newPopulation, possibleGenes);
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
