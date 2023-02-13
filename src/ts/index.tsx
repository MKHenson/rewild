// import { Application } from "./ui/application/Application";
// import { ThemeProvider } from "solid-styled-components";
// import { Router } from "@solidjs/router";
// import { AuthProvider } from "./ui/AuthProvider";
// import { theme } from "./ui/theme";
// import { render } from "solid-js/web";
import "./initJSX";
import { Avatar } from "./ui/common/Avatar";
import { Button } from "./ui/common/Button";
import { Card } from "./ui/common/Card";
import { Typography } from "./ui/common/Typography";
import { StyledMaterialIcon } from "./ui/common/MaterialIcon";
import { HelloWorld } from "./ui/Test";
import { Input } from "./ui/common/Input";
import { Divider } from "./ui/common/Divider";
import { Field } from "./ui/common/Field";
import { Loading } from "./ui/common/Loading";
import { Switch } from "./ui/common/Switch";
import { TreeNode } from "./ui/common/Tree";
import { RouterSwitch } from "./ui/common/RouterSwitch";
import { Route } from "./ui/common/Route";
import { Router } from "./ui/common/Router";
import { Component, register } from "./ui/Component";
import { authStore } from "./ui/stores/Auth";

@register("x-auth-button")
class RandomTest extends Component {
  init() {
    const user = this.observeStore(authStore);
    return () => {
      this.shadow?.append(
        <div>
          <h2>
            {user.user.name} IS {user.loggedIn ? "LOGGED IN" : "LOGGED OUT"}
          </h2>
          <div>
            <button onclick={(e) => (user.loggedIn = !user.loggedIn)}>{user.loggedIn ? "Log out" : "Log In"}</button>
          </div>
          <div>
            <button onclick={(e) => (user.user.name = "Stephen Lawlor")}>Change Name</button>
          </div>
          <div>
            <button onclick={(e) => (user.user.pies = user.user.pies.filter((val, i) => i !== 0))}>Reduce Array</button>
          </div>
        </div>
      );
    };
  }
}

document.addEventListener("readystatechange", (e) => {
  if (document.readyState === "interactive" || document.readyState === "complete") {
    document.querySelector("#application")!.append(
      <Router>
        <Card>
          <RandomTest />
          <div>
            <Divider />
            <h2>Bunch of Components</h2>
            <Button>This is a test</Button>
            <Avatar />
            <Loading size={120} />
            <Switch />
            <Field label="Fields are great">Toooootes</Field>
            <TreeNode
              node={{
                name: "Root node",
                canSelect: true,
                children: [{ name: "Child 1", canSelect: false, children: [] }],
              }}
              selectedNodes={[]}
              onSelectionChanged={(nodes) => console.log("Selection changed")}
            />
            <StyledMaterialIcon icon="attach_email" />
            <Typography variant="h4">This is a hello world</Typography>
            <Input autoFocus />
            <Divider />
          </div>

          <h2>ROUTER TESTS</h2>
          <RouterSwitch>
            <Route path="/" onRender={() => <HelloWorld name="This is HOME" />} />
            <Route
              path="/about"
              exact={false}
              onRender={() => (
                <div>
                  <h2>about</h2>
                  <div>
                    <ul>
                      <li>
                        <a href="/about/more">More about</a>
                      </li>
                    </ul>
                  </div>
                  <RouterSwitch>
                    <Route path="/about" onRender={() => <div>About</div>} />
                    <Route path="/about/more" onRender={() => <div>More About</div>} />
                  </RouterSwitch>
                </div>
              )}
            />
            <Route
              path="/products"
              onRender={() => (
                <div>
                  <h2>products</h2>
                  <RouterSwitch>
                    <Route
                      path="/products/:id/type/:type"
                      exact
                      onRender={(params) => (
                        <div>
                          product selected: {params.id} and is a {params.type}
                        </div>
                      )}
                    />
                  </RouterSwitch>
                </div>
              )}
            />
          </RouterSwitch>

          <div>
            <ul>
              <li>
                <a href="/">home</a>
              </li>
              <li>
                <a href="/about">about</a>
              </li>
              <li>
                <a href="/products">products</a>
              </li>
              <li>
                <a href="/products/1/type/CAR">products 1</a>
              </li>
              <li>
                <a href="/products2/game/intro">intro</a>
              </li>
            </ul>
          </div>
        </Card>
      </Router>
    );
  }
});
