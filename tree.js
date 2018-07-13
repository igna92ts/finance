exports.calculateClassProportion = (classArray, data) => {
  return classArray.reduce((t, e) => {
    const filteredData = data.filter(d => d.action === e);
    return { ...t, [e]: filteredData.length / data.length };
  }, {});
};
