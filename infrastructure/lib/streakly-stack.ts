import * as path from "node:path";
import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import * as cognito from "aws-cdk-lib/aws-cognito";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import * as lambda from "aws-cdk-lib/aws-lambda";
import { NodejsFunction } from "aws-cdk-lib/aws-lambda-nodejs";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as apigw from "aws-cdk-lib/aws-apigatewayv2";
import { HttpLambdaIntegration } from "aws-cdk-lib/aws-apigatewayv2-integrations";
import { HttpUserPoolAuthorizer } from "aws-cdk-lib/aws-apigatewayv2-authorizers";
import * as cw from "aws-cdk-lib/aws-cloudwatch";
import * as logs from "aws-cdk-lib/aws-logs";

export interface StreaklyStackProps extends cdk.StackProps {
  stage: string;
}

export class StreaklyStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: StreaklyStackProps) {
    super(scope, id, props);
    const isProd = props.stage === "prod";
    const removal = isProd ? cdk.RemovalPolicy.RETAIN : cdk.RemovalPolicy.DESTROY;

    // ---- Identity ----
    const userPool = new cognito.UserPool(this, "UserPool", {
      selfSignUpEnabled: true,
      signInAliases: { email: true },
      autoVerify: { email: true },
      accountRecovery: cognito.AccountRecovery.EMAIL_ONLY,
      passwordPolicy: { minLength: 8, requireDigits: true, requireLowercase: true },
      removalPolicy: removal,
    });
    const userPoolClient = userPool.addClient("MobileClient", {
      authFlows: { userSrp: true },
      generateSecret: false, // public mobile client
    });

    // ---- Data ----
    const table = new dynamodb.Table(this, "Table", {
      partitionKey: { name: "PK", type: dynamodb.AttributeType.STRING },
      sortKey: { name: "SK", type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      pointInTimeRecoverySpecification: { pointInTimeRecoveryEnabled: isProd },
      stream: dynamodb.StreamViewType.NEW_IMAGE, // for badges / challenge progress consumers
      removalPolicy: removal,
    });
    // Reminder sweep: find users by reminder time slot.
    table.addGlobalSecondaryIndex({
      indexName: "GSI1",
      partitionKey: { name: "GSI1PK", type: dynamodb.AttributeType.STRING },
      sortKey: { name: "GSI1SK", type: dynamodb.AttributeType.STRING },
    });

    // Private learning-material bucket (used by the RAG phase).
    const filesBucket = new s3.Bucket(this, "LearningFiles", {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      cors: [
        {
          allowedMethods: [s3.HttpMethods.PUT],
          allowedOrigins: ["*"], // tighten to app origins before prod
          allowedHeaders: ["*"],
        },
      ],
      removalPolicy: removal,
      autoDeleteObjects: !isProd,
    });

    // ---- Compute ----
    const backendRoot = path.join(__dirname, "..", "..", "backend");
    const fn = (name: string, entry: string, exportName: string) =>
      new NodejsFunction(this, name, {
        entry: path.join(backendRoot, entry),
        handler: exportName,
        runtime: lambda.Runtime.NODEJS_24_X,
        memorySize: 256,
        timeout: cdk.Duration.seconds(10),
        environment: { TABLE_NAME: table.tableName },
        projectRoot: backendRoot,
        depsLockFilePath: path.join(backendRoot, "package-lock.json"),
        bundling: { minify: true, sourceMap: true },
        logGroup: new logs.LogGroup(this, `${name}Logs`, {
          retention: logs.RetentionDays.ONE_MONTH,
          removalPolicy: removal,
        }),
      });

    const goalsCreate = fn("GoalsCreate", "functions/goals/handler.ts", "create");
    const goalsList = fn("GoalsList", "functions/goals/handler.ts", "list");
    const goalsGet = fn("GoalsGet", "functions/goals/handler.ts", "get");
    const tasksComplete = fn("TasksComplete", "functions/tasks/handler.ts", "complete");

    // Least privilege per function.
    table.grantWriteData(goalsCreate);
    table.grantReadData(goalsList);
    table.grantReadData(goalsGet);
    table.grantReadWriteData(tasksComplete);

    // ---- API ----
    const api = new apigw.HttpApi(this, "Api", {
      apiName: `streakly-${props.stage}`,
      corsPreflight: {
        allowOrigins: ["*"], // tighten for prod
        allowMethods: [apigw.CorsHttpMethod.ANY],
        allowHeaders: ["authorization", "content-type"],
      },
    });
    const authorizer = new HttpUserPoolAuthorizer("CognitoAuth", userPool, {
      userPoolClients: [userPoolClient],
    });
    const route = (p: string, m: apigw.HttpMethod, f: lambda.IFunction) =>
      api.addRoutes({
        path: p,
        methods: [m],
        integration: new HttpLambdaIntegration(`${m}${p}`.replace(/\W/g, ""), f),
        authorizer,
      });

    route("/goals", apigw.HttpMethod.POST, goalsCreate);
    route("/goals", apigw.HttpMethod.GET, goalsList);
    route("/goals/{goalId}", apigw.HttpMethod.GET, goalsGet);
    route("/tasks/{taskId}/complete", apigw.HttpMethod.POST, tasksComplete);

    // Throttle to produce 429s instead of unbounded cost.
    const defaultStage = api.defaultStage?.node.defaultChild as apigw.CfnStage | undefined;
    if (defaultStage) {
      defaultStage.defaultRouteSettings = { throttlingBurstLimit: 50, throttlingRateLimit: 25 };
    }

    // ---- Observability ----
    new cw.Alarm(this, "CompleteErrors", {
      metric: tasksComplete.metricErrors({ period: cdk.Duration.minutes(5) }),
      threshold: 3,
      evaluationPeriods: 1,
      alarmDescription: "Task completion Lambda is erroring",
    });

    // ---- Outputs ----
    new cdk.CfnOutput(this, "ApiUrl", { value: api.apiEndpoint });
    new cdk.CfnOutput(this, "UserPoolId", { value: userPool.userPoolId });
    new cdk.CfnOutput(this, "UserPoolClientId", { value: userPoolClient.userPoolClientId });
    new cdk.CfnOutput(this, "FilesBucket", { value: filesBucket.bucketName });
  }
}
