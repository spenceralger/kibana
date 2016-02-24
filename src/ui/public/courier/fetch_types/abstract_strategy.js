export default function AbstractStrategyProvider() {
  return class AbstractStrategy {
    exectute() {
      throw new Error('Subclasses of AbstractStrategy must override the execute() method.');
    }
  };
}
