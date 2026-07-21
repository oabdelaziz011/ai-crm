import { Component, type ErrorInfo, type ReactNode } from "react";
import { useTranslation } from "react-i18next";

type Props = {
  nodeType: string;
  children: ReactNode;
};

type State = {
  error: Error | null;
};

export class PropertyEditorErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(_error: Error, _info: ErrorInfo) {
    // Keep the builder shell alive; surface inline editor errors only.
  }

  componentDidUpdate(prevProps: Props) {
    if (prevProps.nodeType !== this.props.nodeType) {
      this.setState({ error: null });
    }
  }

  render() {
    if (this.state.error) {
      return <PropertyEditorErrorFallback nodeType={this.props.nodeType} message={this.state.error.message} />;
    }
    return this.props.children;
  }
}

function PropertyEditorErrorFallback({ nodeType, message }: { nodeType: string; message: string }) {
  const { t } = useTranslation("common");
  return (
    <div
      className="rounded-2xl border border-destructive/30 bg-destructive/5 p-4 text-sm"
      role="alert"
      data-testid="property-editor-error"
    >
      <p className="font-semibold text-destructive">
        {t("workflowBuilder.properties.editorErrorTitle", { nodeType, defaultValue: "Could not open editor for {{nodeType}}" })}
      </p>
      <p className="mt-2 text-muted-foreground">{message}</p>
    </div>
  );
}
