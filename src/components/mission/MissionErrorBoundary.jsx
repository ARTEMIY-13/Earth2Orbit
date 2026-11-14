import { Component } from "react";

/** Keeps the rest of the app usable if the planner throws while rendering. */
export default class MissionErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error) {
    return { error };
  }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="toast" role="alert">
        {this.props.lang === "en" ? "The planner stopped with an error: " : "Планувальник зупинився через помилку: "}
        {String(this.state.error.message || this.state.error)}{" "}
        <button className="text-button" onClick={this.props.onClose}>
          {this.props.lang === "en" ? "Close" : "Закрити"}
        </button>
      </div>
    );
  }
}
