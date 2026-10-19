import { Body, Button, Container, Head, Heading, Html, Preview, Section, Text } from "@react-email/components";
import { render } from "@react-email/render";
import { copyFor, type NotificationPayload, type NotificationType } from "./notification-copy";

// Email clients ignore external CSS and most modern features: inline styles and hex colours only.
const INK = "#1c1530";
const PAPER = "#f6f5fa";
const MAGENTA = "#d1005a";
const MUTED = "#5b5470";

interface Props {
  type: NotificationType;
  payload: NotificationPayload;
  appUrl: string;
}

function NotificationEmail({ type, payload, appUrl }: Props) {
  const copy = copyFor(type, payload);
  const greeting = `Hi ${payload.name.trim() || "there"},`;

  return (
    <Html lang="en">
      <Head />
      <Preview>{copy.body[0]}</Preview>
      <Body style={{ margin: 0, background: PAPER, fontFamily: "Arial, Helvetica, sans-serif", color: INK }}>
        <Container style={{ maxWidth: 480, margin: "24px auto", background: "#ffffff", borderRadius: 12, padding: 28 }}>
          <Text style={{ margin: "0 0 8px", fontSize: 22, fontWeight: 800, letterSpacing: "-0.5px" }}>ambagan</Text>
          <Heading as="h1" style={{ margin: "8px 0 16px", fontSize: 26, lineHeight: "1.15" }}>
            {copy.heading}
          </Heading>
          <Text style={{ margin: "0 0 16px", fontSize: 16, lineHeight: "1.5" }}>{greeting}</Text>
          {copy.body.map((line) => (
            <Text key={line} style={{ margin: "0 0 16px", fontSize: 16, lineHeight: "1.5" }}>
              {line}
            </Text>
          ))}
          {copy.facts.length > 0 ? (
            <Section style={{ margin: "8px 0 16px", padding: "12px 16px", background: PAPER, borderRadius: 8 }}>
              {copy.facts.map(([label, value]) => (
                <Text key={label} style={{ margin: "4px 0", fontSize: 14, lineHeight: "1.4" }}>
                  <span style={{ color: MUTED }}>{label}: </span>
                  <strong>{value}</strong>
                </Text>
              ))}
            </Section>
          ) : null}
          {copy.cta ? (
            <Button
              href={`${appUrl}${copy.cta.path}`}
              style={{ background: MAGENTA, color: "#ffffff", fontWeight: 700, padding: "14px 26px", borderRadius: 999, textDecoration: "none", display: "inline-block" }}
            >
              {copy.cta.label}
            </Button>
          ) : null}
          <Text style={{ margin: "24px 0 0", fontSize: 13, lineHeight: "1.5", color: MUTED }}>
            You&apos;re getting this because you&apos;re part of the ambagan group.
          </Text>
        </Container>
      </Body>
    </Html>
  );
}

export interface RenderedNotification {
  html: string;
  text: string;
}

/** Renders one queued notification. React escapes every interpolated value, so member-supplied text can't inject markup. */
export async function renderNotification(
  type: NotificationType,
  payload: NotificationPayload,
  appUrl: string,
): Promise<RenderedNotification> {
  const element = <NotificationEmail type={type} payload={payload} appUrl={appUrl} />;
  const [html, text] = await Promise.all([render(element), render(element, { plainText: true })]);
  return { html, text };
}
