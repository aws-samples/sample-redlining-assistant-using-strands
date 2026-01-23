import * as React from "react";
import PropTypes from "prop-types";

// Import CloudScape styles
import "@cloudscape-design/global-styles/index.css";

// Import CloudScape components
import {
  Container,
  SpaceBetween,
  Header
} from "@cloudscape-design/components";

// Import Amplify
import { Authenticator } from '@aws-amplify/ui-react';
import { Amplify } from 'aws-amplify';
import '@aws-amplify/ui-react/styles.css';

// Import my components
import ChatInterface from "./ChatInterface";

// Import config
import { config } from '../../config';

// Configure Amplify
Amplify.configure({
  Auth: {
    Cognito: {
      userPoolId: config.userPoolId,
      userPoolClientId: config.userPoolClientId,
      region: config.region
    }
  },
  API: {
    Events: {
      endpoint: config.eventApiUrl,
      region: config.region,
      defaultAuthMode: 'userPool'
    }
  }
});

const App = (props) => {
  const { title } = props;

  return (
    <Authenticator
      loginMechanisms={['email']}
      formFields={{
        signUp: {
          given_name: {
            label: 'First Name',
            placeholder: 'Enter your first name',
            required: true,
            order: 1
          },
          family_name: {
            label: 'Last Name', 
            placeholder: 'Enter your last name',
            required: true,
            order: 2
          },
          email: {
            label: 'Email',
            placeholder: 'Enter your email address',
            order: 3
          }
        }
      }}
    >
      {({ signOut, user }) => (
        <Container>
          <SpaceBetween size="l">
            <Header variant="h1">{title}</Header>
            <ChatInterface 
              user={user} 
              signOut={signOut}
            />
          </SpaceBetween>
        </Container>
      )}
    </Authenticator>
  );
};

App.propTypes = {
  title: PropTypes.string,
};

export default App;
