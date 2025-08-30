import { Component } from 'react';

export default class ErrorBoundary extends Component {
  constructor(props){
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error){
    return { error };
  }
  componentDidCatch(err, info){
    // eslint-disable-next-line no-console
    console.error('ErrorBoundary caught:', err, info);
  }
  render(){
    if (this.state.error) {
      return <div className="card" style={{ color:'red' }}>
        Something went wrong while rendering this page. Try going back, or reload.
      </div>;
    }
    return this.props.children;
  }
}
